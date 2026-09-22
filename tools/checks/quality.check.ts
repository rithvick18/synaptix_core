/**
 * Headless checks for §1.1/§7's resolution policy: which tier a machine lands in, and
 * how the pixel-ratio ladder behaves once it starts measuring.
 *
 * Both are pure functions of plain numbers, so the whole climb is replayable here with
 * a synthetic frame-time trace — no GPU, no canvas, no browser. That matters more than
 * usual for this feature, because the failure it has to avoid is one nobody would see
 * in a screenshot: a ladder that keeps hunting, or one that climbs on a machine which
 * was never keeping up in the first place.
 *
 * The check that earns its keep is §1: a software rasteriser must come out with exactly
 * the settings this project had before any of this existed, because `check:offline`
 * runs on SwiftShader and its §7 figure has to stay comparable with every earlier run.
 */
import {
  AdaptiveResolution,
  clampRatio,
  detectQuality,
  detectTier,
  pixelRatioLadder,
  qualityOverrideFromLocation,
  type DeviceInfo
} from '../../src/Quality'

let checks = 0
const failures: string[] = []

function ok(condition: boolean, label: string): void {
  checks++
  if (!condition) failures.push(label)
}

function eq<T>(actual: T, expected: T, label: string): void {
  checks++
  if (actual !== expected) failures.push(`${label}\n     expected ${String(expected)}, got ${String(actual)}`)
}

const GPU: DeviceInfo = {
  renderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
  maxTextureSize: 16384,
  maxAnisotropy: 16,
  deviceMemory: 8,
  hardwareConcurrency: 10,
  devicePixelRatio: 2
}

// ---------------------------------------------------------------------------
// 1. a software rasteriser keeps the pre-existing settings, exactly
// ---------------------------------------------------------------------------

{
  for (const name of [
    'Google SwiftShader',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Mesa OffScreen',
    'Microsoft Basic Render Driver'
  ]) {
    const profile = detectQuality({ ...GPU, renderer: name })
    eq(profile.tier, 'software', `software: "${name}" is recognised as having no GPU`)
    eq(profile.maxPixelRatio, 1, `software: "${name}" never climbs past dpr 1`)
    eq(profile.upgradeResolution, null, `software: "${name}" never fetches 2k maps`)
    eq(profile.anisotropy, 4, `software: "${name}" keeps anisotropy 4`)
    eq(profile.bootResolution, '1k', `software: "${name}" boots at 1k`)
  }

  // The whole ladder collapses to one rung, so §7's sampler may start immediately.
  const profile = detectQuality({ ...GPU, renderer: 'Google SwiftShader' })
  eq(pixelRatioLadder(profile.maxPixelRatio).length, 1, 'software: the ladder has a single rung')
  const adaptive = new AdaptiveResolution({ ladder: pixelRatioLadder(profile.maxPixelRatio), onChange: () => {} })
  ok(adaptive.settled, 'software: the ladder is settled before the first frame')
  eq(adaptive.ratio, 1, 'software: and sits at dpr 1')
}

// ---------------------------------------------------------------------------
// 2. small but real GPUs get better sampling and nothing that costs pixels
// ---------------------------------------------------------------------------

{
  const cases: [string, Partial<DeviceInfo>][] = [
    ['a small texture limit', { maxTextureSize: 4096 }],
    ['2 GiB of memory', { deviceMemory: 2 }],
    ['two logical cores', { hardwareConcurrency: 2 }]
  ]
  for (const [label, patch] of cases) {
    const profile = detectQuality({ ...GPU, ...patch })
    eq(profile.tier, 'baseline', `baseline: ${label} lands in the baseline tier`)
    eq(profile.maxPixelRatio, 1, `baseline: ${label} does not raise the pixel ratio`)
    eq(profile.upgradeResolution, null, `baseline: ${label} does not fetch 2k maps`)
    eq(profile.anisotropy, 8, `baseline: ${label} still gets better-sampled floors`)
  }

  // Anisotropy is a request, not a demand: it is clamped to what the driver offers.
  eq(detectQuality({ ...GPU, maxAnisotropy: 2 }).anisotropy, 2, 'anisotropy: never exceeds the hardware limit')
  eq(detectQuality({ ...GPU, maxAnisotropy: 0 }).anisotropy, 1, 'anisotropy: a driver reporting none still yields a legal value')
}

// ---------------------------------------------------------------------------
// 3. a real GPU gets the upgrade — but boot is still 1k
// ---------------------------------------------------------------------------

{
  const profile = detectQuality(GPU)
  eq(profile.tier, 'full', 'full: a named GPU with room lands in the full tier')
  eq(profile.bootResolution, '1k', 'full: boot is 1k even here — boot time is not for sale')
  eq(profile.upgradeResolution, '2k', 'full: 2k is fetched afterwards instead')
  eq(profile.anisotropy, 16, 'full: anisotropy goes to the hardware maximum')
  eq(profile.maxPixelRatio, 2, 'full: the ladder may climb to the display ratio')
  ok(profile.reason.includes('Apple M2 Pro'), 'full: the reason names what decided it')

  // An unknown renderer string is not a reason to assume the worst — only a software
  // name is. A privacy setting that hides the GPU should not cost a real one its tier.
  eq(detectQuality({ ...GPU, renderer: '' }).tier, 'full', 'full: a hidden renderer name still gets the full tier')
}

// ---------------------------------------------------------------------------
// 4. the ladder's rungs
// ---------------------------------------------------------------------------

{
  eq(pixelRatioLadder(2).join(','), '1,1.25,1.5,1.75,2', 'ladder: a 2x display gets four steps')
  eq(pixelRatioLadder(1).join(','), '1', 'ladder: a 1x display has nowhere to go')
  eq(pixelRatioLadder(1.5).join(','), '1,1.25,1.5', 'ladder: stops at the display ratio')
  eq(pixelRatioLadder(1.1).join(','), '1,1.1', 'ladder: an awkward ratio still ends exactly on it')
  eq(pixelRatioLadder(3).join(','), '1,1.25,1.5,1.75,2', 'ladder: a 3x display is capped at 2')
  eq(clampRatio(0.5), 1, 'ladder: a ratio below 1 is not a reason to render below 1')
  eq(clampRatio(Number.NaN), 1, 'ladder: a nonsense ratio falls back to 1')
  ok(pixelRatioLadder(2).every((r, i, all) => i === 0 || r > all[i - 1]), 'ladder: rungs ascend')
}

// ---------------------------------------------------------------------------
// 5. the climb, replayed against synthetic frame traces
// ---------------------------------------------------------------------------

/** Feeds `frameMs` until the ladder settles, or the frame budget is exhausted. */
function replay(ladder: number[], costFor: (ratio: number) => number, maxFrames = 20000): {
  ratio: number
  changes: number[]
  frames: number
} {
  const changes: number[] = []
  const adaptive = new AdaptiveResolution({ ladder, onChange: (r) => changes.push(r) })
  let frames = 0
  while (!adaptive.settled && frames < maxFrames) {
    adaptive.sample(costFor(adaptive.ratio))
    frames++
  }
  return { ratio: adaptive.ratio, changes, frames }
}

{
  // A machine with headroom everywhere: v-sync holds at every rung, so it reaches the top.
  const fast = replay(pixelRatioLadder(2), () => 16.7)
  eq(fast.ratio, 2, 'climb: a machine that never misses reaches the top rung')
  eq(fast.changes.join(','), '1.25,1.5,1.75,2', 'climb: it arrives one rung at a time')
  ok(fast.frames < 1000, 'climb: and gets there in under a thousand frames')
}

{
  // The realistic case: fine until 1.75, then the deadline starts being missed. It must
  // end at 1.5 — the last rung that worked — and not at the one that did not.
  const stalls = replay(pixelRatioLadder(2), (ratio) => (ratio >= 1.75 ? 33.3 : 16.7))
  eq(stalls.ratio, 1.5, 'climb: a missed deadline settles one rung below where it was missed')
  eq(stalls.changes[stalls.changes.length - 1], 1.5, 'climb: the final change is the step back down')
}

{
  // Already slow at dpr 1. There is nothing below to step back to, so it holds — and it
  // must never have raised the ratio even once on the way to finding that out.
  const slow = replay(pixelRatioLadder(2), () => 40)
  eq(slow.ratio, 1, 'climb: a machine that is slow at dpr 1 stays at dpr 1')
  eq(slow.changes.length, 0, 'climb: and is never made slower first')
}

{
  // A 30 Hz panel — macOS drops to this on low battery. 33.3 ms is the refresh interval,
  // not a cost, but the ceiling cannot tell the difference and the safe reading is the
  // conservative one: do not spend pixels on a machine that is already being throttled.
  const thirty = replay(pixelRatioLadder(2), () => 33.3)
  eq(thirty.ratio, 1, 'climb: a 30 Hz or throttled display is left alone')
}

{
  // A settled ladder never climbs again — no hunting upward while somebody is walking
  // around — but it does keep watching, because the climb's 90-frame reading of a rung
  // can be wrong and the decision is otherwise permanent. Observed on an M4: a rung
  // that read 16.7 ms on the way up sustained 41 ms a minute later.
  const changes: number[] = []
  const adaptive = new AdaptiveResolution({ ladder: pixelRatioLadder(2), onChange: (r) => changes.push(r) })
  while (!adaptive.settled) adaptive.sample(16.7)
  eq(adaptive.ratio, 2, 'watchdog: the climb reaches the top on a machine that never misses')
  ok(!adaptive.finished, 'watchdog: settled is not finished — it keeps watching')
  ok(adaptive.steps.length > 0, 'watchdog: every judged window is recorded for __memoriaAssets')

  // Sustained slowness afterwards gives rungs back, two of them, and then stops.
  for (let i = 0; i < 20000 && !adaptive.finished; i++) adaptive.sample(50)
  eq(adaptive.ratio, 1.5, 'watchdog: two corrections are given back and no more')
  ok(adaptive.finished, 'watchdog: and then it stops for good')
  ok(changes.every((r, i, all) => i === 0 || r !== all[i - 1]), 'watchdog: no change repeats the current ratio')
  ok(changes[changes.length - 1] === 1.5, 'watchdog: the last change is downward')

  // Nothing at all moves it after that, however slow things get.
  for (let i = 0; i < 20000; i++) adaptive.sample(200)
  eq(adaptive.ratio, 1.5, 'watchdog: a finished ladder ignores everything after')
}

{
  // A good window resets the watchdog, so a machine that merely stutters now and then
  // keeps its resolution. Fed a window at a time rather than by a formula, because the
  // property under test is exactly "two *consecutive* bad windows" and an off-by-a-few
  // trace would test something else.
  const adaptive = new AdaptiveResolution({ ladder: pixelRatioLadder(2), onChange: () => {} })
  const feed = (ms: number, count: number): void => { for (let i = 0; i < count; i++) adaptive.sample(ms) }
  while (!adaptive.settled) adaptive.sample(16.7)
  feed(16.7, 20) // the settle frames the watchdog discards after the climb stops
  for (let i = 0; i < 20; i++) { feed(50, 90); feed(16.7, 90) }
  eq(adaptive.ratio, 2, 'watchdog: bad windows separated by good ones never cost a rung')
  ok(!adaptive.finished, 'watchdog: and it is still watching')

  // Two in a row, though, is the evidence it is waiting for.
  feed(50, 180)
  eq(adaptive.ratio, 1.75, 'watchdog: two consecutive bad windows do give a rung back')
}

{
  // A ladder that settled at the bottom has nothing to give back and must simply stop,
  // rather than watching forever for a correction it could never make.
  const adaptive = new AdaptiveResolution({ ladder: pixelRatioLadder(2), onChange: () => {} })
  while (!adaptive.settled) adaptive.sample(40)
  eq(adaptive.ratio, 1, 'watchdog: a ladder stuck at the bottom settles there')
  ok(adaptive.finished, 'watchdog: and finishes immediately, with nothing left to watch')
}

{
  // Corrections can be turned off entirely, which is what a single-rung ladder is.
  const adaptive = new AdaptiveResolution({ ladder: pixelRatioLadder(2), onChange: () => {}, corrections: 0 })
  while (!adaptive.settled) adaptive.sample(16.7)
  ok(adaptive.finished, 'watchdog: corrections: 0 finishes as soon as the climb does')
  for (let i = 0; i < 20000; i++) adaptive.sample(200)
  eq(adaptive.ratio, 2, 'watchdog: and then never moves')
}

{
  // A single 400 ms frame — a tab switch, a GC pause, a door's shadow refresh — is not
  // evidence about resolution, and treating it as one would end the climb immediately.
  let n = 0
  const spiky = replay(pixelRatioLadder(2), () => (++n % 300 === 0 ? 400 : 16.7))
  eq(spiky.ratio, 2, 'climb: an isolated stall does not end the climb')
}

{
  // Nor is a single bad *window*. Observed while measuring this feature on real
  // hardware: one 90-frame window came back at 46 ms in an otherwise v-synced run, and
  // acting on it alone would have cost a rung for the whole session. Two consecutive
  // bad windows is evidence; one is weather.
  let windows = 0
  const blip = replay(pixelRatioLadder(2), (ratio) => {
    // Exactly one bad window's worth of frames, at the second rung.
    if (ratio === 1.25 && ++windows > 20 && windows <= 110) return 46
    return 16.7
  })
  eq(blip.ratio, 2, 'strikes: one bad window is re-measured, not acted on')
  ok(blip.changes.includes(1.5), 'strikes: and the climb continues past it')

  // Two in a row is a different matter.
  const real = replay(pixelRatioLadder(2), (ratio) => (ratio >= 1.5 ? 46 : 16.7))
  eq(real.ratio, 1.25, 'strikes: two consecutive bad windows do step the ratio down')

  const adaptive = new AdaptiveResolution({ ladder: pixelRatioLadder(2), onChange: () => {}, strikes: 2 })
  let frames = 0
  while (!adaptive.settled && frames++ < 20000) adaptive.sample(adaptive.ratio >= 1.5 ? 46 : 16.7)
  ok(adaptive.steps.some((step) => step.action === 'retry'), 'strikes: the re-measurement is recorded as its own step')
}

// ---------------------------------------------------------------------------
// 6. the ladder does not measure through the texture upgrade
// ---------------------------------------------------------------------------
//
// Found on real hardware, not reasoned about: on an M4 the ladder climbed to 1.25,
// measured 26 ms while twelve 2k JPEGs were decoding and uploading, read that as this
// machine's steady frame time and stepped back down to dpr 1 for the rest of the
// session. The one-off cost of getting sharper textures was being paid for twice — once
// in the stall, and again in a permanently lower resolution.

{
  const changes: number[] = []
  const adaptive = new AdaptiveResolution({
    ladder: pixelRatioLadder(2),
    onChange: (r) => changes.push(r),
    startPaused: true
  })
  ok(adaptive.waiting, 'paused: a ladder waiting on the upgrade reports itself waiting')
  // The upgrade's stall, fed in while paused. None of it may count.
  for (let i = 0; i < 5000; i++) adaptive.sample(45)
  eq(changes.length, 0, 'paused: nothing moves while the upgrade is running')
  eq(adaptive.ratio, 1, 'paused: and the ratio is untouched')
  ok(!adaptive.settled, 'paused: the ladder has not decided anything yet')

  adaptive.resume()
  ok(!adaptive.waiting, 'paused: resume clears the wait')
  let frames = 0
  while (!adaptive.settled && frames++ < 20000) adaptive.sample(16.7)
  eq(adaptive.ratio, 2, 'paused: measuring only after the upgrade reaches the top rung')

  // Resume must also throw away the frames right after it, which are still carrying
  // the last GPU uploads — otherwise the stall simply moves one window later.
  const late = new AdaptiveResolution({ ladder: pixelRatioLadder(2), onChange: () => {}, startPaused: true })
  late.resume()
  eq(late.waiting, false, 'paused: resume is idempotent enough to be called from either branch')
  late.resume()
  eq(late.ratio, 1, 'paused: a second resume changes nothing')
}

// ---------------------------------------------------------------------------
// 7. ?quality= — an override that cannot ask for more than the hardware has
// ---------------------------------------------------------------------------

{
  eq(qualityOverrideFromLocation('?quality=full'), 'full', 'override: a valid tier is read')
  eq(qualityOverrideFromLocation('?patient=mira&quality=baseline'), 'baseline', 'override: alongside other tokens')
  eq(qualityOverrideFromLocation('?quality=ultra'), null, 'override: an unknown tier is ignored, not an error')
  eq(qualityOverrideFromLocation(''), null, 'override: absent means detect')

  const software: DeviceInfo = { ...GPU, renderer: 'Google SwiftShader' }
  const forced = detectQuality(software, 'full')
  eq(forced.tier, 'full', 'override: a software rasteriser can be forced to the full tier for testing')
  ok(forced.reason.includes('SwiftShader'), 'override: the reason still records what was actually detected')
  eq(detectTier(software).tier, 'software', 'override: detection itself is unchanged by it')

  // The clamps are below the override, not above it.
  const poor: DeviceInfo = { ...GPU, maxAnisotropy: 2, devicePixelRatio: 1 }
  const asked = detectQuality(poor, 'full')
  eq(asked.anisotropy, 2, 'override: cannot ask for anisotropy the driver does not have')
  eq(asked.maxPixelRatio, 1, 'override: cannot ask for a ratio above the display\'s own')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
