/**
 * Headless checks for Checkpoint D — recording, aggregation and export.
 *
 * Two halves: pure checks on `summarise` over hand-built logs, where every stamp is
 * chosen so the arithmetic is obvious; and one end-to-end run of the real MissionRunner
 * through the real Telemetry into the real Recorder, which is the only way to prove the
 * pause-awareness claim rather than assert it.
 */
import * as THREE from 'three'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { PackMedia, validate } from '../../src/MemoryPack'
import { MissionRunner, type MemoryPack } from '../../src/Missions'
import {
  NOT_DIAGNOSTIC,
  Recorder,
  Telemetry,
  buildExport,
  dwellByObject,
  exportFilename,
  missionIdsIn,
  summarise,
  type Event,
  type Outcome
} from '../../src/Telemetry'
import type { WorldSource } from '../../src/World'

let checks = 0
const failures: string[] = []
const ok = (c: boolean, label: string): void => {
  checks++
  if (!c) failures.push(label)
}
const eq = <T,>(actual: T, expected: T, label: string): void => {
  checks++
  if (actual !== expected) failures.push(`${label}\n     expected ${String(expected)}, got ${String(actual)}`)
}

/** The repository root, handed in by `tools/checks/run.mjs`: the bundle runs from a
 *  temp directory, so nothing relative to this file survives the build. */
const ROOT = process.env.SMRITI_ROOT ?? process.cwd()

// ---------------------------------------------------------------------------
// 1. Recorder — §5.6 resets the event log
// ---------------------------------------------------------------------------

{
  const r = new Recorder()
  r.record({ t: 0, kind: 'mission_start', id: 'water' })
  r.record({ t: 10, kind: 'room_enter', room: 'hallway' })
  eq(r.size, 2, 'recorder: records events')
  r.record({ t: 20, kind: 'restart' })
  eq(r.size, 0, '§5.6 restart clears the telemetry event log')
  eq(r.restarts, 1, 'recorder: counts restarts')
  ok(
    !r.log.some((e) => e.kind === 'restart'),
    '§5.6 the restart event itself does not survive into the new session'
  )
  r.record({ t: 0, kind: 'mission_start', id: 'water' })
  eq(r.size, 1, 'recorder: the new session starts from empty')
  eq(summarise(r.log).outcomes.skipped, 0, 'recorder: the cleared session summarises cleanly')
}

// ---------------------------------------------------------------------------
// 2. summarise — §4.4's rules, on logs whose arithmetic is checkable by eye
// ---------------------------------------------------------------------------

/** navigate(independent) · find(cued, 1 hint) · recall(independent, answered at 9s) */
const cleanRun: Event[] = [
  { t: 0, kind: 'mission_start', id: 'water' },
  { t: 0, kind: 'step_start', step: 0, type: 'navigate' },
  { t: 1_000, kind: 'room_enter', room: 'hallway' },
  { t: 3_000, kind: 'room_enter', room: 'kitchen' },
  { t: 3_000, kind: 'step_end', step: 0, type: 'navigate', outcome: 'independent' },
  { t: 3_000, kind: 'step_start', step: 1, type: 'find' },
  { t: 23_000, kind: 'hint_shown', level: 1, step: 1 },
  { t: 24_000, kind: 'object_dwell', id: 'water-jug', ms: 900 },
  { t: 25_000, kind: 'object_interact', id: 'water-jug', correct: true },
  { t: 25_000, kind: 'step_end', step: 1, type: 'find', outcome: 'cued' },
  { t: 25_000, kind: 'step_start', step: 2, type: 'recall' },
  { t: 25_500, kind: 'question_shown', step: 2 },
  { t: 30_000, kind: 'answer_selected', choice: 'bina', correct: false },
  { t: 34_500, kind: 'answer_selected', choice: 'ananya', correct: true },
  { t: 34_500, kind: 'step_end', step: 2, type: 'recall', outcome: 'independent' },
  { t: 34_500, kind: 'mission_complete', id: 'water' }
]

{
  const s = summarise(cleanRun)
  eq(s.missionId, 'water', 'summary: mission id')
  eq(s.completed, true, 'summary: completed')
  eq(s.completionTimeMs, 34_500, '§4.4 completionTime is mission_complete − mission_start')
  eq(s.hintsUsed, 1, '§4.4 hintsUsed')
  eq(s.maxHintLevel, 1, '§4.4 maxHintLevel')
  eq(s.roomsVisited.join(','), 'hallway,kitchen', '§4.4 roomsVisited, in order, deduplicated')
  eq(s.pauses, 0, 'summary: no pauses in a clean run')

  // §4.3 — all four, always present, never merged.
  eq(Object.keys(s.outcomes).sort().join(','), 'cued,independent,revealed,skipped', '§4.3 all four keys present')
  eq(s.outcomes.independent, 2, '§4.3 independent count')
  eq(s.outcomes.cued, 1, '§4.3 cued count')
  eq(s.outcomes.revealed, 0, '§4.3 revealed count is present even at zero')
  eq(s.outcomes.skipped, 0, '§4.3 skipped count is present even at zero')

  eq(s.steps.length, 3, 'summary: one row per step')
  eq(s.steps[0].durationMs, 3_000, 'summary: step duration')
  eq(s.steps[1].hintsUsed, 1, 'summary: the hint is attributed to the step it fired on')
  eq(s.steps[2].selections, 2, 'summary: both choices are counted')

  // §4.4 — answerLatency runs from question_shown, not from step_start.
  eq(s.steps[2].answerLatencyMs, 34_500 - 25_500, '§4.4 answerLatency is measured from question_shown')
  eq(s.steps[2].timeToRevealMs, null, '§4.4 timeToReveal is null when nothing was revealed')
  eq(s.answerLatencyMs, 9_000, '§4.4 session answerLatency')
  eq(s.recallAnswered, 1, 'summary: one recall question produced a latency')
  eq(s.timeToRevealMs, null, '§4.4 session timeToReveal is null with no reveal')
  eq(s.steps[0].answerLatencyMs, null, '§4.4 a navigate step has no answerLatency')
}

{
  // §4.4's central rule: a revealed step reports null latency and a separate reveal time.
  const revealed: Event[] = [
    { t: 0, kind: 'mission_start', id: 'water' },
    { t: 0, kind: 'step_start', step: 0, type: 'recall' },
    { t: 500, kind: 'question_shown', step: 0 },
    { t: 20_500, kind: 'hint_shown', level: 1, step: 0 },
    { t: 45_500, kind: 'hint_shown', level: 2, step: 0 },
    { t: 75_500, kind: 'hint_shown', level: 3, step: 0 },
    { t: 78_000, kind: 'answer_selected', choice: 'ananya', correct: true },
    { t: 78_000, kind: 'step_end', step: 0, type: 'recall', outcome: 'revealed' },
    { t: 78_000, kind: 'mission_complete', id: 'water' }
  ]
  const s = summarise(revealed)
  eq(s.outcomes.revealed, 1, '§4.3 revealed counted')
  eq(s.outcomes.independent, 0, '§4.3 a revealed step is never counted as correct')
  eq(s.outcomes.cued, 0, '§4.3 a revealed step is not cued either')
  eq(s.steps[0].answerLatencyMs, null, '§4.4 answerLatency is NULL on a revealed step')
  eq(s.steps[0].timeToRevealMs, 75_500 - 500, '§4.4 timeToReveal runs question_shown → reveal')
  eq(s.answerLatencyMs, null, '§4.4 session answerLatency stays null')
  eq(s.timeToRevealMs, 75_000, '§4.4 session timeToReveal is present')
  eq(s.recallRevealed, 1, 'summary: one reveal counted')
  ok(
    s.steps[0].answerLatencyMs !== s.steps[0].timeToRevealMs,
    '§4.4 the two are never folded together — a fast reveal cannot look like a fast answer'
  )
  eq(s.maxHintLevel, 3, '§4.4 maxHintLevel reaches 3')
  eq(s.hintsUsed, 3, '§4.4 hintsUsed counts every level shown')
}

{
  // A skipped step: latency null, and skipped is never correct.
  const skipped: Event[] = [
    { t: 0, kind: 'mission_start', id: 'water' },
    { t: 0, kind: 'step_start', step: 0, type: 'recall' },
    { t: 100, kind: 'question_shown', step: 0 },
    { t: 4_000, kind: 'step_end', step: 0, type: 'recall', outcome: 'skipped' },
    { t: 4_000, kind: 'mission_complete', id: 'water' }
  ]
  const s = summarise(skipped)
  eq(s.steps[0].answerLatencyMs, null, '§4.4 answerLatency is NULL on a skipped step')
  eq(s.steps[0].timeToRevealMs, null, 'summary: a skip with no reveal has no reveal time')
  eq(s.outcomes.skipped, 1, '§4.3 skipped counted')
  eq(s.outcomes.independent + s.outcomes.cued, 0, '§4.3 skipped is never counted as correct')
}

{
  // Skipped *after* a reveal keeps the reveal time and still reports null latency.
  const both: Event[] = [
    { t: 0, kind: 'step_start', step: 0, type: 'recall' },
    { t: 0, kind: 'question_shown', step: 0 },
    { t: 75_000, kind: 'hint_shown', level: 3, step: 0 },
    { t: 80_000, kind: 'step_end', step: 0, type: 'recall', outcome: 'skipped' }
  ]
  const s = summarise(both)
  eq(s.steps[0].answerLatencyMs, null, '§4.4 revealed-then-skipped → latency null')
  eq(s.steps[0].timeToRevealMs, 75_000, '§4.4 revealed-then-skipped → reveal time kept')
}

{
  // An incomplete session still summarises — export is available mid-run.
  const partial: Event[] = [
    { t: 0, kind: 'mission_start', id: 'water' },
    { t: 0, kind: 'step_start', step: 0, type: 'navigate' },
    { t: 2_000, kind: 'room_enter', room: 'hallway' }
  ]
  const s = summarise(partial)
  eq(s.completed, false, 'summary: an unfinished session is not marked complete')
  eq(s.completionTimeMs, null, '§4.4 completionTime is null until the mission completes')
  eq(s.steps.length, 0, 'summary: an open step contributes no row')
  eq(s.roomsVisited.length, 1, 'summary: rooms visited so far are still reported')
}

// ---------------------------------------------------------------------------
// 3. Dwell aggregation — §4.4 logs dwell, not frames
// ---------------------------------------------------------------------------

{
  const log: Event[] = [
    { t: 1_000, kind: 'object_dwell', id: 'water-jug', ms: 900 },
    { t: 2_000, kind: 'object_dwell', id: 'kitchenDoor', ms: 300 },
    { t: 3_000, kind: 'object_dwell', id: 'water-jug', ms: 1_600 }
  ]
  const totals = dwellByObject(log)
  eq(totals.length, 2, 'dwell: one row per object')
  eq(totals[0].id, 'water-jug', 'dwell: sorted by total time')
  eq(totals[0].totalMs, 2_500, 'dwell: totals summed')
  eq(totals[0].looks, 2, 'dwell: separate looks counted')

  // The 250 ms floor lives in the emitter, so nothing under it can reach the log.
  const t = new Telemetry(() => 5_000)
  const seen: Event[] = []
  t.onEvent = (e) => seen.push(e)
  t.objectDwell('water-jug', 249)
  eq(seen.length, 0, '§4.4 a dwell under 250 ms is never emitted')
  t.objectDwell('water-jug', 250)
  eq(seen.length, 1, '§4.4 a dwell at the threshold is emitted')
}

// ---------------------------------------------------------------------------
// 4. Export — §6 Checkpoint D's gate
// ---------------------------------------------------------------------------

{
  const doc = buildExport(cleanRun, {
    patientId: 'mira',
    patientName: 'Mira',
    levelId: 'water',
    levelIndex: 0,
    levelTitle: 'A glass of water',
    attemptId: 'mira-water-a1',
    attemptNumber: 1,
    restarts: 2
  })
  eq(doc.format, 'smriti-telemetry', 'export: tagged format')
  eq(doc.patient.id, 'mira', 'export: patient id')
  eq(doc.notDiagnostic, NOT_DIAGNOSTIC, '§4.4 the not-diagnostic label travels in the file')
  ok(doc.notDiagnostic.includes('not diagnostic'), '§4.4 the label says "not diagnostic"')
  ok(doc.comparability.includes('same patient'), '§4.4 the file says what it may be compared against')
  eq(doc.session.restarts, 2, 'export: restart count recorded')
  eq(doc.events.length, cleanRun.length, 'export: the raw log is included in full')
  eq(doc.summary.outcomes.revealed, 0, '§6 export has all four outcome counts')
  eq(Object.keys(doc.summary.outcomes).length, 4, '§6 export has exactly four outcome counts')

  // The gate, literally: answerLatency null on revealed steps, timeToReveal present.
  const revealedDoc = buildExport(
    [
      { t: 0, kind: 'step_start', step: 0, type: 'recall' },
      { t: 0, kind: 'question_shown', step: 0 },
      { t: 70_000, kind: 'hint_shown', level: 3, step: 0 },
      { t: 72_000, kind: 'step_end', step: 0, type: 'recall', outcome: 'revealed' }
    ],
    {
      patientId: 'raju',
      patientName: 'Raju',
      levelId: 'familiar-memories',
      levelIndex: 2,
      levelTitle: 'Familiar memories',
      attemptId: 'raju-familiar-memories-a1',
      attemptNumber: 1,
      restarts: 0
    }
  )
  const parsed = JSON.parse(JSON.stringify(revealedDoc))
  eq(parsed.summary.steps[0].answerLatencyMs, null, '§6 export: answerLatency is null on a revealed step')
  ok('answerLatencyMs' in parsed.summary.steps[0], '§6 export: the field is present, not omitted')
  eq(parsed.summary.steps[0].timeToRevealMs, 70_000, '§6 export: timeToReveal is present')
  ok(JSON.stringify(revealedDoc).includes('not diagnostic'), '§4.4 the serialised JSON carries the label')

  // --- level and attempt identity (requirement 7) --------------------------
  eq(doc.level.id, 'water', 'export: names the level by its mission id')
  eq(doc.level.index, 0, 'export: names the level by its position in the pack')
  eq(doc.level.title, 'A glass of water', 'export: names the level by title')
  eq(doc.mission.id, 'water', 'export: the pre-levels `mission` alias still resolves')
  eq(doc.session.attemptId, 'mira-water-a1', 'export: names the attempt')
  eq(doc.session.attemptNumber, 1, 'export: numbers the attempt')
  eq(doc.session.missionIdsInLog.length, 1, 'export: the log covers exactly one level')
  eq(doc.session.missionIdsInLog[0], 'water', 'export: and it is the level that was played')
  eq(doc.patient.id, 'mira', 'export: names the pack the content came from')
  ok(Array.isArray(doc.summary.steps) && doc.summary.steps.length === 3, 'export: per-step results')
  ok(
    doc.summary.steps.every((s) => 'outcome' in s && 'durationMs' in s && 'answerLatencyMs' in s),
    'export: every step carries its own outcome, duration and latency'
  )
  eq(revealedDoc.level.id, 'familiar-memories', 'export: a level-3 attempt names level 3')

  ok(
    /^smriti-mira-water-\d{4}-\d{2}-\d{2}/.test(exportFilename('mira', 'water')),
    'export: filename names the patient, the level and the date'
  )
  ok(!exportFilename('mira', 'water').includes(':'), 'export: filename has no colons')
  ok(
    exportFilename('mira', null).includes('-session-'),
    'export: a filename with no level chosen still says so rather than inventing one'
  )
}

// ---------------------------------------------------------------------------
// 5. End to end — the real runner, the real Telemetry, and a clock that pauses
// ---------------------------------------------------------------------------

function makeWorld() {
  const box = (x0: number, z0: number, x1: number, z1: number): THREE.Box3 =>
    new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 2.7, z1))
  const obj = (): THREE.Object3D => new THREE.Object3D()
  const world = {
    room: null as string | null,
    root: new THREE.Object3D(),
    blockers: [] as THREE.Box3[],
    triggers: [
      { room: 'kitchen', box: box(1.3, -6, 7.5, -0.5) },
      { room: 'livingRoom', box: box(1.3, -0.5, 7.5, 6) }
    ],
    anchors: { livingRoomWall: obj(), bedsideFrame: obj(), audioSource: obj() },
    // Every id §1 requires, and nothing more: the point of this stub is that a pack
    // may lean on the contract and on nothing else.
    interactables: {
      'water-jug': obj(),
      radio: obj(),
      'wall-photo': obj(),
      kitchenDoor: obj()
    },
    hintTargets: {
      kitchenDoor: obj(),
      livingArch: obj(),
      kitchenArch: obj(),
      'water-jug': obj(),
      radio: obj(),
      'wall-photo': obj()
    },
    spawn: { position: new THREE.Vector3(0, 1.6, 10), yaw: 0 },
    roomOf(): string | null {
      return world.room
    }
  }
  return world
}

/** Models State.elapsed() exactly: wall time advances, the clock only while running. */
class FakeState {
  current = 'exploring'
  private ms = 0
  private running = true
  wallMs = 0
  get timersRunning(): boolean {
    return this.running
  }
  elapsed(): number {
    return this.ms
  }
  advance(ms: number): void {
    this.wallMs += ms
    if (this.running) this.ms += ms
  }
  set(next: string): void {
    this.current = next
    this.running = next === 'exploring' || next === 'answering'
  }
  pause(): void {
    this.set('paused')
  }
}

class FakeUI {
  card: Record<string, unknown> | null = null
  overlayVisible = false
  get answerCardVisible(): boolean {
    return this.card !== null
  }
  showAnswerCard(o: Record<string, unknown>): void {
    this.card = o
  }
  updateAnswerCard(patch: Record<string, unknown>): void {
    if (this.card) this.card = { ...this.card, ...patch }
  }
  hideAnswerCard(): void {
    this.card = null
  }
  showInstruction(): void {}
  hideInstruction(): void {}
  setHint(): void {}
}

const noop = (): void => {}
const fakePlayer = { releaseLock: noop, requestLock: noop, groundPoint: () => new THREE.Vector3() }
const fakeVoices = { play: () => true, stop: noop }

const miraPack = validate(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'public/packs/mira/pack.json'), 'utf8')),
  makeWorld() as unknown as WorldSource
).pack as MemoryPack

/** Text cards, no media — this suite is about timing, not photographs. */
const textMedia = new PackMedia()

function endToEnd(missionIndex = 0) {
  const world = makeWorld()
  const state = new FakeState()
  const ui = new FakeUI()
  const recorder = new Recorder()
  const telemetry = new Telemetry(() => state.elapsed())
  telemetry.onEvent = (e) => recorder.record(e)

  const build = (index: number): MissionRunner =>
    new MissionRunner({
      pack: miraPack,
      mission: miraPack.missions[index],
      world: world as unknown as WorldSource,
      player: fakePlayer as never,
      state: state as never,
      telemetry,
      ui: ui as never,
      media: textMedia,
      voices: fakeVoices as never,
      levelLabel: `Level ${index + 1} of ${miraPack.missions.length}`
    })

  const rig = {
    runner: build(missionIndex),
    ui,
    state,
    world,
    recorder,
    /**
     * What `main.ts`'s `startLevel` does, in the same order: tear the old runner down,
     * empty the log for a new attempt, build a runner for the chosen level, start it.
     * Modelling the order matters — clearing after the new runner had started would
     * throw away its own `mission_start`.
     */
    switchTo(index: number): void {
      telemetry.restart()
      rig.runner.dispose()
      recorder.beginAttempt(`mira-${miraPack.missions[index].id}-a${recorder.attempts + 1}`)
      rig.runner = build(index)
      rig.runner.start()
    }
  }
  return rig
}

{
  // A clean playthrough with a long pause in the middle of the navigate step.
  const r = endToEnd()
  r.runner.start()

  r.state.advance(4_000)
  r.runner.update()

  // Pause for ten minutes of wall time. The clock must not move.
  r.state.pause()
  r.state.advance(600_000)
  r.runner.update()
  eq(r.runner.level, 0, '§5.1 no hint fires while paused')
  r.state.set('exploring')

  r.state.advance(2_000)
  r.world.room = 'kitchen'
  r.runner.notifyRoom('kitchen')

  r.state.advance(3_000)
  r.runner.notifyInteract('water-jug')

  // Recall: answer it after five seconds.
  r.state.advance(5_000)
  const onSelect = r.ui.card!.onSelect as (id: string) => void
  onSelect('ananya')

  const s = summarise(r.recorder.log)
  eq(s.completed, true, 'end to end: the mission completed')
  eq(r.state.wallMs, 614_000, 'end to end: ten minutes of wall time really did pass')
  eq(
    s.completionTimeMs,
    14_000,
    '§4.4 paused time is absent from completionTime — 14s of play, not 614s of wall clock'
  )
  ok(
    s.completionTimeMs !== null && s.completionTimeMs < r.state.wallMs,
    '§4.4 every duration is shorter than wall time once a pause has happened'
  )
  eq(s.steps[0].durationMs, 6_000, '§4.4 the paused step reports only its running time')
  eq(s.outcomes.independent, 3, '§4.3 three independent steps')
  eq(s.outcomes.cued + s.outcomes.revealed + s.outcomes.skipped, 0, '§4.3 nothing else counted')
  eq(s.steps[2].answerLatencyMs, 5_000, '§4.4 answerLatency from the card appearing to the answer')
  eq(s.steps[2].timeToRevealMs, null, '§4.4 no reveal, no reveal time')
  eq(s.roomsVisited.join(','), 'kitchen', 'end to end: rooms visited')
}

{
  // The other extreme: skip everything. Three skips, no latency anywhere.
  const r = endToEnd()
  r.runner.start()
  r.runner.skip()
  r.runner.skip()
  r.runner.skip()
  const s = summarise(r.recorder.log)
  eq(s.outcomes.skipped, 3, '§4.3 three skipped steps')
  eq(s.outcomes.independent, 0, '§4.3 skipping is never correct')
  eq(s.completed, true, 'skipping through still completes the mission')
  eq(s.answerLatencyMs, null, '§4.4 no answerLatency when everything was skipped')
  ok(
    s.steps.every((step) => step.answerLatencyMs === null),
    '§4.4 every skipped step reports null latency'
  )
}

{
  // Level 3 on the recall step, then Continue: revealed, with a reveal time.
  const r = endToEnd()
  r.runner.start()
  r.runner.skip()
  r.runner.skip()
  const shownAt = r.state.elapsed()
  r.state.advance(76_000)
  r.runner.update()
  eq(r.runner.level, 3, 'end to end: level 3 reached on the recall step')
  const onContinue = r.ui.card!.onContinue as () => void
  r.state.advance(2_000)
  onContinue()

  const s = summarise(r.recorder.log)
  eq(s.outcomes.revealed, 1, '§4.3 revealed counted end to end')
  eq(s.steps[2].answerLatencyMs, null, '§4.4 end to end: answerLatency null on the revealed step')
  ok(
    s.steps[2].timeToRevealMs !== null && s.steps[2].timeToRevealMs >= 75_000,
    '§4.4 end to end: timeToReveal present and measured from the question'
  )
  void shownAt
  eq(s.maxHintLevel, 3, '§4.4 end to end: maxHintLevel 3')
}

{
  // A restart mid-session leaves no trace of the abandoned attempt in the summary.
  const r = endToEnd()
  r.runner.start()
  r.state.advance(5_000)
  r.runner.skip()
  r.runner.skip()
  r.runner.skip()
  eq(summarise(r.recorder.log).outcomes.skipped, 3, 'restart: the first attempt was recorded')

  r.recorder.record({ t: r.state.elapsed(), kind: 'restart' })
  r.runner.reset()
  r.world.room = null
  r.runner.start()
  r.state.advance(1_000)
  r.world.room = 'kitchen'
  r.runner.notifyRoom('kitchen')
  r.runner.notifyInteract('water-jug')
  const onSelect = r.ui.card!.onSelect as (id: string) => void
  onSelect('ananya')

  const s = summarise(r.recorder.log)
  eq(s.outcomes.skipped, 0, '§5.6 the abandoned attempt is absent from the new summary')
  eq(s.outcomes.independent, 3, '§5.6 only the new attempt is counted')
  eq(r.recorder.restarts, 1, '§5.6 the restart is still counted as provenance')
}

// ---------------------------------------------------------------------------
// 6. Three levels — repeated room visits, multiple recall steps, level switching
// ---------------------------------------------------------------------------

{
  // The pack the game actually ships must have three runnable levels.
  eq(miraPack.missions.length, 3, 'levels: the pack carries three levels')
  eq(new Set(miraPack.missions.map((m) => m.id)).size, 3, 'levels: their ids are distinct')
  ok(
    miraPack.missions.every((m) => m.description.length > 0),
    'levels: every level has a description for the selection screen'
  )
}

{
  // --- Level 2: the same room visited twice, and counted twice ----------------
  const r = endToEnd(1)
  const mission = miraPack.missions[1]
  eq(mission.steps.length, 6, 'level 2: six steps')
  eq(mission.steps.filter((s) => s.type === 'navigate').length, 3, 'level 2: three navigate steps')
  eq(mission.steps.filter((s) => s.type === 'find').length, 3, 'level 2: three find steps')
  const rooms = mission.steps.filter((s) => s.type === 'navigate').map((s) => s.targetRoom)
  eq(rooms.join(','), 'livingRoom,kitchen,livingRoom', 'level 2: the living room is visited twice')

  r.runner.start()
  r.state.advance(2_000)

  // Walk it: living room → radio → kitchen → jug → living room → photograph.
  r.world.room = 'livingRoom'
  r.runner.notifyRoom('livingRoom')
  eq(r.runner.stepIndex, 1, 'level 2: arriving in the living room finishes step 1')
  r.state.advance(3_000)
  r.runner.notifyInteract('radio')
  eq(r.runner.stepIndex, 2, 'level 2: the radio finishes step 2')

  r.state.advance(4_000)
  r.world.room = 'kitchen'
  r.runner.notifyRoom('kitchen')
  eq(r.runner.stepIndex, 3, 'level 2: the kitchen finishes step 3')
  r.state.advance(2_000)
  r.runner.notifyInteract('water-jug')
  eq(r.runner.stepIndex, 4, 'level 2: the jug finishes step 4')

  r.state.advance(5_000)
  r.world.room = 'livingRoom'
  // The *second* entry into a room already visited. §5.5's containment test runs at
  // step start and the player is in the kitchen then, so this is a real re-entry.
  r.runner.notifyRoom('livingRoom')
  eq(r.runner.stepIndex, 5, 'level 2: returning to the living room finishes step 5')
  r.state.advance(2_000)
  r.runner.notifyInteract('wall-photo')

  const s = summarise(r.recorder.log)
  ok(s.completed, 'level 2: the level completes')
  eq(s.steps.length, 6, 'level 2: six step results')
  eq(s.outcomes.independent, 6, 'level 2: all six independent')
  eq(s.roomsVisited.length, 2, 'level 2: two distinct rooms visited')
  eq(s.roomsVisited.join(','), 'livingRoom,kitchen', 'level 2: in the order first entered')
  eq(s.roomEntries, 3, 'level 2: three room entries — the repeat visit is not swallowed')
  ok(
    s.roomEntries > s.roomsVisited.length,
    'level 2: a repeated visit shows up in the entry count and not in the room set'
  )
  eq(s.answerLatencyMs, null, 'level 2: no recall step, so no answer latency at all')
  eq(s.recallAnswered, 0, 'level 2: nothing to average')
}

{
  // --- Level 3: two recall steps, timed separately ----------------------------
  const r = endToEnd(2)
  const mission = miraPack.missions[2]
  const recalls = mission.steps.filter((s) => s.type === 'recall')
  eq(recalls.length, 2, 'level 3: two recall steps')
  eq(recalls[0].choiceType, 'person', 'level 3: the first question identifies a person')
  eq(recalls[1].choiceType, 'text', 'level 3: the second question uses explicit text choices')
  ok(recalls[1].options !== undefined, 'level 3: the text question carries its options')

  r.runner.start()
  r.world.room = 'livingRoom'
  r.runner.notifyRoom('livingRoom')
  r.runner.notifyInteract('wall-photo')
  eq(r.runner.stepIndex, 2, 'level 3: the photograph leads to the first question')

  // Question one: answered after 6 s, no hint.
  eq((r.ui.card!.choices as { id: string }[]).length, 3, 'level 3: three cards on the person question')
  r.state.advance(6_000)
  ;(r.ui.card!.onSelect as (id: string) => void)('bina')
  eq(r.runner.stepIndex, 3, 'level 3: the person question ends on the answer')

  // Question two: a different format, answered after 11 s, also no hint.
  const textCards = r.ui.card!.choices as { id: string; name: string; photoUrl: string | null }[]
  eq(textCards.length, 3, 'level 3: three cards on the event question')
  ok(
    textCards.every((c) => c.photoUrl === null),
    'level 3: a text question renders text cards — there is no portrait to mix in'
  )
  ok(
    textCards.some((c) => c.name === 'Bihu'),
    'level 3: the cards show the caregiver’s own labels, not the option ids'
  )
  r.state.advance(11_000)
  ;(r.ui.card!.onSelect as (id: string) => void)('bihu')

  const s = summarise(r.recorder.log)
  ok(s.completed, 'level 3: the level completes')
  eq(s.steps.length, 4, 'level 3: four step results')
  eq(s.outcomes.independent, 4, 'level 3: all four independent')

  // The point of "keep recall timing per step": two questions, two latencies, kept apart.
  const q1 = s.steps[2]
  const q2 = s.steps[3]
  eq(q1.type, 'recall', 'level 3: step 3 is a recall step')
  eq(q2.type, 'recall', 'level 3: step 4 is a recall step')
  eq(q1.answerLatencyMs, 6_000, 'level 3: question one keeps its own 6 s latency')
  eq(q2.answerLatencyMs, 11_000, 'level 3: question two keeps its own 11 s latency')
  ok(q1.answerLatencyMs !== q2.answerLatencyMs, 'level 3: the two are not collapsed into one')
  eq(s.recallAnswered, 2, 'level 3: the session mean is declared to be over two questions')
  eq(s.answerLatencyMs, 8_500, 'level 3: and it is their mean, not either one of them')
  eq(s.timeToRevealMs, null, 'level 3: nothing was revealed, so timeToReveal stays null')
}

{
  // --- A revealed question beside an answered one, in the same attempt --------
  const r = endToEnd(2)
  r.runner.start()
  r.world.room = 'livingRoom'
  r.runner.notifyRoom('livingRoom')
  r.runner.notifyInteract('wall-photo')

  // Question one: left until level 3 reveals it.
  r.state.advance(76_000)
  r.runner.update()
  eq(r.runner.level, 3, 'mixed: question one reaches the reveal')
  ;(r.ui.card!.onContinue as () => void)()

  // Question two: answered in 5 s.
  r.state.advance(5_000)
  ;(r.ui.card!.onSelect as (id: string) => void)('bihu')

  const s = summarise(r.recorder.log)
  eq(s.outcomes.revealed, 1, 'mixed: one revealed')
  eq(s.outcomes.independent, 3, 'mixed: the other three independent')
  eq(s.steps[2].answerLatencyMs, null, '§4.4 mixed: the revealed question has no latency')
  ok(s.steps[2].timeToRevealMs !== null, '§4.4 mixed: it has a time to reveal instead')
  eq(s.steps[3].answerLatencyMs, 5_000, '§4.4 mixed: the answered question keeps its own')
  eq(s.recallAnswered, 1, '§4.4 mixed: the mean is over the one that was answered')
  eq(s.answerLatencyMs, 5_000, '§4.4 mixed: a reveal never averages into a latency')
  eq(s.recallRevealed, 1, '§4.4 mixed: and the reveal is reported on its own')
}

{
  // --- Switching levels starts a fresh attempt --------------------------------
  const r = endToEnd(0)
  r.runner.start()
  r.world.room = 'kitchen'
  r.runner.notifyRoom('kitchen')
  r.state.advance(3_000)
  r.runner.notifyInteract('water-jug')
  r.state.advance(2_000)
  ;(r.ui.card!.onSelect as (id: string) => void)('ananya')

  const first = summarise(r.recorder.log)
  ok(first.completed, 'switch: level 1 finished')
  eq(first.missionId, 'water', 'switch: the log names level 1')
  eq(r.recorder.attempts, 0, 'switch: the first attempt here was opened by the rig, not counted')

  // Now switch to level 3 and play two steps of it.
  r.switchTo(2)
  eq(r.recorder.attempts, 1, 'switch: the new attempt is counted')
  eq(r.recorder.attemptId, 'mira-familiar-memories-a1', 'switch: and is identified')

  const afterSwitch = summarise(r.recorder.log)
  eq(afterSwitch.missionId, 'familiar-memories', 'switch: the log now names level 3')
  eq(afterSwitch.completed, false, 'switch: and it has not been completed')
  eq(afterSwitch.outcomes.independent, 0, 'switch: level 1’s outcomes are gone')
  eq(afterSwitch.steps.length, 0, 'switch: level 1’s step results are gone')
  eq(afterSwitch.roomsVisited.length, 0, 'switch: level 1’s rooms are gone')
  eq(
    missionIdsIn(r.recorder.log).length,
    1,
    'requirement 7: the log never combines events from two attempts'
  )
  eq(missionIdsIn(r.recorder.log)[0], 'familiar-memories', 'switch: only the new level is in it')

  const doc = buildExport(r.recorder.log, {
    patientId: 'mira',
    patientName: 'Mira',
    levelId: 'familiar-memories',
    levelIndex: 2,
    levelTitle: 'Familiar memories',
    attemptId: r.recorder.attemptId,
    attemptNumber: r.recorder.attempts,
    restarts: r.recorder.restarts
  })
  eq(doc.session.missionIdsInLog.length, 1, 'switch: the export says so on its face')
  eq(doc.level.id, 'familiar-memories', 'switch: the export names the level played')
  eq(doc.session.attemptId, 'mira-familiar-memories-a1', 'switch: and the attempt')

  // Playing on after the switch records only the new level.
  r.world.room = 'livingRoom'
  r.runner.notifyRoom('livingRoom')
  const s = summarise(r.recorder.log)
  eq(s.steps.length, 1, 'switch: the new attempt records its own steps from zero')
  eq(s.roomsVisited.join(','), 'livingRoom', 'switch: and its own rooms')
}

{
  // --- Disposing a runner detaches its hint beacon ----------------------------
  // Two attempts in a row would otherwise leave two beacons pulsing in the world.
  const r = endToEnd(0)
  const beacons = (): number =>
    r.world.root.children.filter((c) => c.name === 'hint-beacon').length
  eq(beacons(), 1, 'dispose: the first runner adds one beacon')
  r.switchTo(1)
  eq(beacons(), 1, 'dispose: switching levels leaves exactly one')
  r.switchTo(2)
  eq(beacons(), 1, 'dispose: and still one after a second switch')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}

void (undefined as unknown as Outcome)
