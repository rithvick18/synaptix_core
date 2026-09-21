import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import type { DeviceInfo } from './Quality'
import type { StageProgress } from './ui'

/**
 * SPEC.md §3 — WebGLRenderer, HDRLoader + PMREM, ACES.
 *
 * Version pin (§0): three 0.181.2, so the current API names apply — `HDRLoader`
 * (not `RGBELoader`, renamed in r179) and `PCFShadowMap` (soft shadows moved here in
 * r181; `PCFSoftShadowMap` is deprecated for `WebGLRenderer`).
 */

/**
 * Deliberately still 1k, while the surface textures now climb to 2k. This file is never
 * sampled directly: `scene.background` is a flat colour, and the HDRI's only job is to
 * be prefiltered by `PMREMGenerator` into a small mip chain of irradiance. That output
 * is a fixed size whatever goes in, so a 2k source would be four times the download for
 * a difference confined to the sharpest reflections in a house made of plaster, laminate
 * and fabric. Resolution spent where it cannot be seen is just load.
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
    // Starts at 1 and stays there until `Quality.ts`'s ladder has measured that this
    // machine can afford more — see `setPixelRatio`. Beginning at the cheapest rung is
    // what makes the first measurement a reading of the display's own refresh interval
    // rather than of a resolution nobody has checked yet.
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
  async setupEnvironment(onProgress?: StageProgress): Promise<EnvironmentReport> {
    // One item: the HDRI. Counted rather than turned into a percentage, because a
    // percentage of one file is either 0 or 100 and pretends to be neither.
    onProgress?.('hdri', 0, 0, 1)
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
      onProgress?.('hdri', 1, 0, 1)
      return { hdri: 'loaded' }
    } catch {
      this.scene.environment = null
      this.hemi.intensity = 1.5
      this.sun.intensity = 2.6
      // §1.1: a failed HDRI is a fallback, not an error. It is still *reported* — a
      // silent fallback is how a demo machine ends up looking wrong for no visible reason.
      onProgress?.('hdri', 0, 1, 1)
      return { hdri: 'failed' }
    }
  }

  /**
   * The one lever that changes how many pixels are drawn, and therefore the only one
   * whose cost is quadratic. `AdaptiveResolution` owns when this is called; §7's sampler
   * waits until it has stopped calling it, so a reported frame time belongs to one
   * resolution. `setSize` preserves the ratio, so resizing afterwards keeps it.
   */
  setPixelRatio(ratio: number): void {
    if (this.renderer.getPixelRatio() === ratio) return
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  /** What `Quality.detectQuality` needs, read once. `WEBGL_debug_renderer_info` is the
   *  only way to tell a real GPU from a software rasteriser, and it may be absent. */
  deviceInfo(): DeviceInfo {
    const gl = this.renderer.getContext()
    let name = ''
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '')
    } catch {
      /* Blocked by a privacy setting; the baseline tier is the safe reading. */
    }
    const nav = navigator as Navigator & { deviceMemory?: number }
    return {
      renderer: name,
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: nav.hardwareConcurrency,
      devicePixelRatio: window.devicePixelRatio || 1
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
