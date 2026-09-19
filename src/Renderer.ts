import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

/**
 * SPEC.md §3 — WebGLRenderer, HDRLoader + PMREM, ACES.
 *
 * Version pin (§0): three 0.181.2, so the current API names apply — `HDRLoader`
 * (not `RGBELoader`, renamed in r179) and `PCFShadowMap` (soft shadows moved here in
 * r181; `PCFSoftShadowMap` is deprecated for `WebGLRenderer`).
 */

const HDRI_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr'
const HDRI_TIMEOUT_MS = 10000

export interface EnvironmentReport {
  hdri: 'loaded' | 'failed'
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera

  private pmrem: THREE.PMREMGenerator
  private hemi: THREE.HemisphereLight
  private sun: THREE.DirectionalLight

  constructor(canvasParent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    // §0/§7: pixelRatio is pinned to 1 so measured frame time means the same thing on
    // every machine, and so a retina laptop does not quietly render 4x the pixels.
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // The house is static apart from its doors, and there are enough shadow-casting
    // lights that re-rendering every shadow map each frame halved the frame rate.
    // The loop calls `refreshShadows()` once at start-up and again while a door swings.
    this.renderer.shadowMap.autoUpdate = false
    canvasParent.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x8fb3d9)

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120)

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.pmrem.compileEquirectangularShader()

    // Baseline lighting exists before any download is attempted, so a total network
    // failure changes intensities rather than leaving a black room (§1.1).
    this.hemi = new THREE.HemisphereLight(0xdfe8f2, 0x6b5a48, 1.0)
    this.scene.add(this.hemi)

    // The sun lights the garden and casts the house's own shadow. Interiors are lit by
    // one shadow-casting spot per room, added in proceduralHouse.ts, because the roof
    // blocks this light entirely.
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.6)
    this.sun.position.set(-14, 16, 12)
    this.sun.target.position.set(0, 0, 0)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    // Tight frustum on purpose: at 2048 over ±22 m a texel is ~2 cm, and the normalBias
    // needed to hide acne then pushed the lookup past wall edges and leaked daylight
    // onto interior floors. ±15 m gives ~1.5 cm texels and a bias small enough not to.
    this.sun.shadow.camera.left = -15
    this.sun.shadow.camera.right = 15
    this.sun.shadow.camera.top = 15
    this.sun.shadow.camera.bottom = -15
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 55
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.012
    this.scene.add(this.sun, this.sun.target)

    window.addEventListener('resize', this.onResize)
  }

  /**
   * §1.1: HDRI download or decode failure must leave the scene playable with
   * `scene.environment = null` and the hemisphere + directional pair carrying the room.
   */
  async setupEnvironment(): Promise<EnvironmentReport> {
    try {
      const texture = await new Promise<THREE.DataTexture>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('hdri timeout')), HDRI_TIMEOUT_MS)
        new HDRLoader().setCrossOrigin('anonymous').load(
          HDRI_URL,
          (tex) => {
            clearTimeout(timer)
            resolve(tex as THREE.DataTexture)
          },
          undefined,
          () => {
            clearTimeout(timer)
            reject(new Error('hdri failed'))
          }
        )
      })
      const envMap = this.pmrem.fromEquirectangular(texture).texture
      texture.dispose()
      this.scene.environment = envMap
      // Kept low deliberately: at 0.55 the studio HDRI reflected off floors at grazing
      // angles and blew the far end of every room to white (Fresnel, not a shadow bug).
      this.scene.environmentIntensity = 0.28
      // The HDRI carries ambient bounce, so the stand-in lights step back.
      this.hemi.intensity = 0.7
      this.sun.intensity = 2.2
      return { hdri: 'loaded' }
    } catch {
      this.scene.environment = null
      this.hemi.intensity = 1.5
      this.sun.intensity = 2.6
      return { hdri: 'failed' }
    }
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  /** Re-render every shadow map on the next frame. Cheap to call; costly to call often. */
  refreshShadows(): void {
    this.renderer.shadowMap.needsUpdate = true
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }
}
