/**
 * SPEC.md §1.1 / §7 — how much resolution this machine can actually afford.
 *
 * Three things decide how sharp the house looks: the size of the texture files, how
 * well those textures are sampled at grazing angles (anisotropy), and how many pixels
 * the renderer draws (device pixel ratio). Each was previously pinned to its cheapest
 * safe value — 1k maps, anisotropy 4, `pixelRatio` 1 — because a fixed low setting is
 * the only one guaranteed not to melt an unknown machine.
 *
 * This module replaces the pin with a measurement. Two parts:
 *
 * 1. **`detectQuality`** reads what the GPU reports about itself and picks a tier. It
 *    is deliberately pessimistic: anything it does not recognise as a real GPU gets the
 *    old settings exactly. A software rasteriser — headless Chrome's SwiftShader, which
 *    is what `npm run check:offline` runs on — is pinned to the old values on purpose,
 *    so the §7 figure that check prints stays comparable with every earlier run.
 *
 * 2. **`AdaptiveResolution`** climbs a pixel-ratio ladder while the frame budget holds
 *    and stops one rung below wherever it started missing. §7 warns that a frame time
 *    sitting on a multiple of the refresh interval is a v-sync reading and not a cost —
 *    which is exactly why it works as a *signal* here. This never reports that interval
 *    as a cost; it only asks "are we still meeting the deadline?", climbs while the
 *    answer is yes, and freezes the moment it is no.
 *
 * Everything below is a pure function of plain values, so `npm run check` exercises the
 * tier rules and the whole ladder without a browser, a GPU or a canvas.
 */

/** Poly Haven publishes each texture set at several sizes; these are the two used. */
export type TextureResolution = '1k' | '2k'

export type QualityTier = 'software' | 'baseline' | 'full'

export interface DeviceInfo {
  /** `UNMASKED_RENDERER_WEBGL`, or '' when the extension is unavailable. */
  renderer: string
  maxTextureSize: number
  maxAnisotropy: number
  /** `navigator.deviceMemory`, in GiB. Absent outside Chromium. */
  deviceMemory?: number
  hardwareConcurrency?: number
  devicePixelRatio: number
}

export interface QualityProfile {
  tier: QualityTier
  /** One line naming what decided the tier. Printed to the console and `__smritiAssets`. */
  reason: string
  /** What the house loads during boot. Always the cheap one — boot time is not for sale. */
  bootResolution: TextureResolution
  /** What it upgrades to afterwards, in the background, or null to stay put. */
  upgradeResolution: TextureResolution | null
  anisotropy: number
  /** The top rung the adaptive ladder may reach. 1 means "do not climb". */
  maxPixelRatio: number
}

/**
 * Names that mean "there is no GPU here". Chrome's headless SwiftShader and Mesa's
 * llvmpipe both draw correctly and both do it on the CPU, where four times the texels
 * and twice the pixels are four times and twice the work with no hardware to absorb it.
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i

/** A real GPU that is still small: phones, older integrated parts, low-memory laptops. */
function isSmall(device: DeviceInfo): string | null {
  if (device.maxTextureSize > 0 && device.maxTextureSize < 8192) return `maxTextureSize ${device.maxTextureSize}`
  if (device.deviceMemory !== undefined && device.deviceMemory <= 2) return `deviceMemory ${device.deviceMemory} GiB`
  if (device.hardwareConcurrency !== undefined && device.hardwareConcurrency <= 2) {
    return `${device.hardwareConcurrency} logical cores`
  }
  return null
}

/** What the machine says about itself, before any override is applied. */
export function detectTier(device: DeviceInfo): { tier: QualityTier; reason: string } {
  if (SOFTWARE.test(device.renderer)) {
    return { tier: 'software', reason: `software rasteriser (${device.renderer.trim() || 'unnamed'}) — holding the baseline settings` }
  }
  const small = isSmall(device)
  if (small) return { tier: 'baseline', reason: `${small} — 1k maps, no resolution climb` }
  return { tier: 'full', reason: `${device.renderer.trim() || 'unnamed GPU'} — 2k maps after boot, climbing to dpr ${clampRatio(device.devicePixelRatio)}` }
}

/**
 * `?quality=software|baseline|full`, in the same spirit as `?break=` and `?patient=`:
 * a way to exercise a path on a machine that would not choose it, and a way out for a
 * caregiver whose GPU is read wrong. An unrecognised value is ignored rather than
 * treated as an error — a mistyped debug token must not stop the house loading.
 */
export function qualityOverrideFromLocation(search: string): QualityTier | null {
  const raw = new URLSearchParams(search).get('quality')
  return raw === 'software' || raw === 'baseline' || raw === 'full' ? raw : null
}

/**
 * Every tier's settings are still clamped to what the hardware actually offers, so an
 * override can ask for a tier but never for anisotropy the driver does not have or a
 * pixel ratio above the display's own.
 */
export function detectQuality(device: DeviceInfo, override: QualityTier | null = null): QualityProfile {
  const anisotropy = (cap: number): number => Math.max(1, Math.min(cap, device.maxAnisotropy || 1))
  const detected = detectTier(device)
  const tier = override ?? detected.tier
  const reason = override
    ? `forced by ?quality=${override} (detected: ${detected.reason})`
    : detected.reason

  if (tier === 'software') {
    return { tier, reason, bootResolution: '1k', upgradeResolution: null, anisotropy: anisotropy(4), maxPixelRatio: 1 }
  }
  if (tier === 'baseline') {
    return { tier, reason, bootResolution: '1k', upgradeResolution: null, anisotropy: anisotropy(8), maxPixelRatio: 1 }
  }
  return {
    tier,
    reason,
    bootResolution: '1k',
    upgradeResolution: '2k',
    anisotropy: anisotropy(16),
    maxPixelRatio: clampRatio(device.devicePixelRatio)
  }
}

/** Above 2 the extra pixels are past what anyone can see and cost the square of it. */
export function clampRatio(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1) return 1
  return Math.min(raw, 2)
}

/**
 * The rungs, coarse enough that each step is worth a measurement window. A display
 * reporting 1.5 gets [1, 1.25, 1.5] and stops there — never above its own ratio, where
 * the extra samples would be downscaled away.
 */
export function pixelRatioLadder(maxPixelRatio: number): number[] {
  const max = clampRatio(maxPixelRatio)
  const rungs = [1, 1.25, 1.5, 1.75, 2].filter((r) => r <= max + 1e-9)
  if (rungs[rungs.length - 1] < max - 1e-9) rungs.push(max)
  return rungs
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface AdaptiveOptions {
  ladder: number[]
  /** Called with the new ratio each time a rung is taken. Never called for a hold. */
  onChange(ratio: number): void
  /** Frames dropped after a change, while the driver reallocates its buffers. */
  settleFrames?: number
  /** Frames measured per rung before the rung is judged. */
  windowFrames?: number
  /** Climbing stops if a window is slower than this, whatever the ratio. ~50 fps. */
  ceilingMs?: number
  /** A window this much slower than the best one seen means a missed deadline. */
  missFactor?: number
  /**
   * Consecutive bad windows required before stepping down. One is not enough: a
   * notification, a Spotlight index or another tab waking up during a single 90-frame
   * window would otherwise cost the resolution for the rest of the session, and the
   * decision is permanent. A good window resets the count.
   */
  strikes?: number
  /** How close to the best window a rung must stay to earn another one. */
  climbFactor?: number
  /**
   * Start ignoring frames until `resume()` is called. The background texture upgrade
   * decodes twelve 2k JPEGs and uploads them, which costs real main-thread time while
   * it runs; measuring through it reads that one-off cost as this machine's steady
   * frame time and freezes the ladder several rungs too low, permanently. Measured on
   * an M4: climbing during the upgrade settled at dpr 1, and afterwards at dpr 2.
   */
  startPaused?: boolean
  /**
   * Downward corrections allowed after the climb has stopped. The climb's reading of a
   * rung is 90 frames long and can be wrong — measured on an M4, a rung that read
   * 16.7 ms on the way up sustained 41 ms a minute later. The decision is otherwise
   * permanent, so the ladder keeps watching and gives back rungs it cannot hold. It
   * never climbs again, so this can correct but never oscillate.
   */
  corrections?: number
}

export interface AdaptiveStep {
  ratio: number
  medianMs: number
  action: 'up' | 'down' | 'hold' | 'retry'
}

/**
 * Climbs the ladder while the frame deadline is met and freezes one rung below where it
 * was not. It freezes rather than hunting: a resolution that oscillates while someone is
 * walking through a room is worse to look at than a fixed rung slightly below the best
 * one, and this is a game for people with dementia — a picture that keeps changing
 * sharpness is a picture that keeps asking to be noticed.
 */
export class AdaptiveResolution {
  /** One entry per judged window. `__smritiAssets` carries it, so the climb is visible. */
  readonly steps: AdaptiveStep[] = []

  private index = 0
  private ignored = 0
  private window: number[] = []
  private best = Infinity
  private done: boolean
  private paused: boolean
  private strikes = 0
  private watching = false
  private corrections = 0

  private readonly settleFrames: number
  private readonly windowFrames: number
  private readonly ceilingMs: number
  private readonly missFactor: number
  private readonly climbFactor: number
  private readonly maxStrikes: number
  private readonly maxCorrections: number

  constructor(private readonly options: AdaptiveOptions) {
    this.settleFrames = options.settleFrames ?? 20
    this.windowFrames = options.windowFrames ?? 90
    this.ceilingMs = options.ceilingMs ?? 20
    this.missFactor = options.missFactor ?? 1.35
    this.climbFactor = options.climbFactor ?? 1.15
    this.maxStrikes = Math.max(1, options.strikes ?? 2)
    this.maxCorrections = Math.max(0, options.corrections ?? 2)
    // A single-rung ladder has nothing to decide, so §7's sampler may start at once.
    this.done = options.ladder.length <= 1
    this.paused = options.startPaused ?? false
  }

  /** Begins measuring. Discards the settle window again, so the frames immediately
   *  after whatever was being waited for do not count against the first rung. */
  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.ignored = 0
    this.window = []
    this.strikes = 0
  }

  /** True while `sample` is deliberately discarding frames. */
  get waiting(): boolean {
    return this.paused && !this.done
  }

  get ratio(): number {
    return this.options.ladder[this.index]
  }

  /**
   * True once the climb has stopped. §7's sampler waits for this — and restarts itself
   * if a later correction moves the ratio again, so the figure it finally reports always
   * belongs to one resolution rather than to an average of several.
   */
  get settled(): boolean {
    return this.done
  }

  /** True once the ratio will not change again for any reason. */
  get finished(): boolean {
    return this.done && !this.watching
  }

  sample(frameMs: number): void {
    if (this.paused) return
    if (this.done && !this.watching) return
    if (this.ignored < this.settleFrames) {
      this.ignored++
      return
    }
    // A frame long enough to be a tab switch, a GC pause or a door's shadow refresh is
    // not evidence about resolution, and one of them would end the climb on its own.
    if (frameMs > 250) return
    this.window.push(frameMs)
    if (this.window.length < this.windowFrames) return

    const medianMs = median(this.window)
    this.window = []
    this.best = Math.min(this.best, medianMs)

    const missed = medianMs > this.best * this.missFactor
    const tooSlow = medianMs > this.ceilingMs
    const canClimb = this.index < this.options.ladder.length - 1

    // --- after the climb: give back a rung this machine turned out not to hold -----
    if (this.watching) {
      if (!missed && !tooSlow) {
        // Nothing is pushed to `steps` for a good window, so the record a session
        // accumulates stays the size of the decisions it made.
        this.strikes = 0
        return
      }
      this.strikes++
      if (this.strikes < this.maxStrikes) {
        this.steps.push({ ratio: this.ratio, medianMs: +medianMs.toFixed(2), action: 'retry' })
        return
      }
      this.strikes = 0
      this.corrections++
      if (this.index > 0) {
        this.steps.push({ ratio: this.ratio, medianMs: +medianMs.toFixed(2), action: 'down' })
        this.index--
        this.ignored = 0
        this.options.onChange(this.ratio)
      } else {
        // Already at the bottom rung: there is nothing left to give back.
        this.steps.push({ ratio: this.ratio, medianMs: +medianMs.toFixed(2), action: 'hold' })
        this.watching = false
      }
      if (this.corrections >= this.maxCorrections) this.watching = false
      return
    }

    // --- the climb ----------------------------------------------------------------
    if (missed || tooSlow) {
      this.strikes++
      if (this.strikes < this.maxStrikes) {
        // Not yet evidence. Re-measure this rung rather than acting on one window.
        this.steps.push({ ratio: this.ratio, medianMs: +medianMs.toFixed(2), action: 'retry' })
        return
      }
      const action = this.index > 0 ? 'down' : 'hold'
      this.steps.push({ ratio: this.ratio, medianMs: +medianMs.toFixed(2), action })
      if (this.index > 0) {
        this.index--
        this.options.onChange(this.ratio)
      }
      this.stopClimbing()
      return
    }

    this.strikes = 0

    if (canClimb && medianMs <= this.best * this.climbFactor) {
      this.steps.push({ ratio: this.ratio, medianMs: +medianMs.toFixed(2), action: 'up' })
      this.index++
      this.ignored = 0
      this.options.onChange(this.ratio)
      return
    }

    this.steps.push({ ratio: this.ratio, medianMs: +medianMs.toFixed(2), action: 'hold' })
    this.stopClimbing()
  }

  private stopClimbing(): void {
    this.done = true
    this.strikes = 0
    this.ignored = 0
    this.window = []
    this.watching = this.maxCorrections > 0 && this.index > 0
  }
}
