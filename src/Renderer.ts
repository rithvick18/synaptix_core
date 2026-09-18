import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { CEILING_HEIGHT } from './layout'

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
    canvasParent.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0e0f11)

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60)

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.pmrem.compileEquirectangularShader()

    // Baseline lighting exists before any download is attempted, so a total network
    // failure changes intensities rather than leaving a black room (§1.1).
    this.hemi = new THREE.HemisphereLight(0xdfe8f2, 0x6b5a48, 1.4)
    this.scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2)
    this.sun.position.set(-6, 6.5, 4)
    this.sun.target.position.set(0, 0, 0)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.left = -9
    this.sun.shadow.camera.right = 9
    this.sun.shadow.camera.top = 9
    this.sun.shadow.camera.bottom = -9
    this.sun.shadow.camera.near = 0.5
    this.sun.shadow.camera.far = 30
    this.sun.shadow.bias = -0.0015
    this.sun.shadow.normalBias = 0.02
    this.scene.add(this.sun, this.sun.target)

    // Two unshadowed fills, one per room, so both rooms are legible without a second
    // shadow map. Cheap, and they keep the kitchen readable when the HDRI is absent.
    for (const x of [-3, 3]) {
      const fill = new THREE.PointLight(0xffe9cf, 8, 9, 2)
      fill.position.set(x, CEILING_HEIGHT - 0.35, 0)
      this.scene.add(fill)
    }

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
      this.scene.environmentIntensity = 0.55
      // The HDRI carries ambient bounce, so the stand-in lights step back.
      this.hemi.intensity = 0.5
      this.sun.intensity = 1.8
      return { hdri: 'loaded' }
    } catch {
      this.scene.environment = null
      this.hemi.intensity = 1.4
      this.sun.intensity = 2.2
      return { hdri: 'failed' }
    }
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }
}
