/**
 * SPEC.md §4.3 / §4.4 — the typed event union and the hook functions the mission runner
 * calls.
 *
 * Checkpoint B defines the vocabulary and wires every call site. It deliberately does
 * **not** record, aggregate or export: there is no event array, no summary computation
 * and no JSON writer here. That is Checkpoint D's job, and §4.4 is explicit that D
 * "must not need to revisit mission logic" — so every place an event can happen already
 * calls a hook, and D only has to fill in what the hooks do with it.
 *
 * `onEvent` is the seam D plugs into. It is the whole of B's persistence story: one
 * optional listener, nothing stored.
 */

/** §4.3 — four values, never merged. Revealed and skipped are never counted as correct. */
export type Outcome = 'independent' | 'cued' | 'revealed' | 'skipped'

/** §4.4 — the event union, verbatim. */
export type Event =
  | { t: number; kind: 'mission_start' | 'mission_complete'; id: string }
  | { t: number; kind: 'step_start' | 'step_end'; step: number; type: string; outcome?: Outcome }
  | { t: number; kind: 'room_enter'; room: string }
  | { t: number; kind: 'object_dwell'; id: string; ms: number }
  | { t: number; kind: 'object_interact'; id: string; correct: boolean }
  | { t: number; kind: 'question_shown'; step: number }
  | { t: number; kind: 'answer_selected'; choice: string; correct: boolean }
  | { t: number; kind: 'hint_shown'; level: 1 | 2 | 3; step: number }
  | { t: number; kind: 'pause' | 'resume' | 'restart' }

export type EventListener = (event: Event) => void

/**
 * §4.4: "emit `object_dwell` only when the raycast target changes, and only past a
 * 250 ms threshold." The threshold lives here rather than in the caller so D reads the
 * same number the emitter used.
 */
export const DWELL_THRESHOLD_MS = 250

export class Telemetry {
  /** Checkpoint D replaces this with recording. B leaves it for the caller to observe. */
  onEvent: EventListener | null = null

  /**
   * `now` is `State.elapsed`, not `performance.now` — §5.1 stops the clock in `paused`
   * and `completed`, and every `t` in the log has to be on that same paused-time-removed
   * clock or D's durations will include time the player was not playing.
   */
  constructor(private now: () => number) {}

  /** Milliseconds since the session clock started, rounded — the `t` on every event. */
  private t(): number {
    return Math.round(this.now())
  }

  private emit(event: Event): void {
    this.onEvent?.(event)
  }

  // --- Mission lifecycle -----------------------------------------------------

  missionStart(id: string): void {
    this.emit({ t: this.t(), kind: 'mission_start', id })
  }

  missionComplete(id: string): void {
    this.emit({ t: this.t(), kind: 'mission_complete', id })
  }

  stepStart(step: number, type: string): void {
    this.emit({ t: this.t(), kind: 'step_start', step, type })
  }

  stepEnd(step: number, type: string, outcome: Outcome): void {
    this.emit({ t: this.t(), kind: 'step_end', step, type, outcome })
  }

  // --- Movement and interaction ---------------------------------------------

  roomEnter(room: string): void {
    this.emit({ t: this.t(), kind: 'room_enter', room })
  }

  /** Only past `DWELL_THRESHOLD_MS`, and only when the raycast target changes (§4.4). */
  objectDwell(id: string, ms: number): void {
    if (ms < DWELL_THRESHOLD_MS) return
    this.emit({ t: this.t(), kind: 'object_dwell', id, ms: Math.round(ms) })
  }

  objectInteract(id: string, correct: boolean): void {
    this.emit({ t: this.t(), kind: 'object_interact', id, correct })
  }

  // --- Recall ----------------------------------------------------------------

  /** §4.4: `answerLatency` is measured from here; D needs this to land before the card. */
  questionShown(step: number): void {
    this.emit({ t: this.t(), kind: 'question_shown', step })
  }

  answerSelected(choice: string, correct: boolean): void {
    this.emit({ t: this.t(), kind: 'answer_selected', choice, correct })
  }

  // --- Assistance and session controls ---------------------------------------

  hintShown(level: 1 | 2 | 3, step: number): void {
    this.emit({ t: this.t(), kind: 'hint_shown', level, step })
  }

  pause(): void {
    this.emit({ t: this.t(), kind: 'pause' })
  }

  resume(): void {
    this.emit({ t: this.t(), kind: 'resume' })
  }

  /** §5.6 resets the telemetry event log; in D this hook is where that clearing happens. */
  restart(): void {
    this.emit({ t: this.t(), kind: 'restart' })
  }
}

// ===========================================================================
// Checkpoint D — recording, aggregation and export
//
// Everything below consumes the events above and adds no new call sites: §4.4 requires
// that D "must not need to revisit mission logic", and it did not. `Recorder` plugs into
// the `onEvent` seam B left; `summarise` is a pure function of the recorded log.
//
// One property carries the whole of §4.4's "pause stops all timers; subtract paused time
// from every duration": every `t` above is `State.elapsed()`, which does not advance
// while paused. Durations here are differences of those stamps, so paused time is
// already absent — it is never subtracted afterwards, because it was never added.
// ===========================================================================

/** §4.4's "auxiliary interaction measures" label, shown on screen *and* exported. */
export const NOT_DIAGNOSTIC = 'auxiliary interaction measures — not diagnostic'

/**
 * The event log. §5.6 resets it, and the `restart` hook is where that happens: a restart
 * begins a new session, so the previous one's events must not leak into its summary.
 */
export class Recorder {
  private events: Event[] = []
  /** How many times §5.6's restart has cleared the log this page-load. */
  restarts = 0
  /** How many attempts have been opened this page-load, across all levels. */
  attempts = 0
  /** Identifies the attempt the current log belongs to. Empty before the first one. */
  attemptId = ''

  /**
   * Opens a new attempt: a replay of the same level, or a switch to a different one.
   *
   * Clearing here is what makes "never combine events from different attempts" a
   * property of the recorder rather than a rule the caller has to remember. There is no
   * path that appends to a log belonging to an earlier attempt, because the only way to
   * start one is through this method, and it empties the log before it returns.
   */
  beginAttempt(attemptId: string): void {
    this.events = []
    this.attemptId = attemptId
    this.attempts++
  }

  record(event: Event): void {
    if (event.kind === 'restart') {
      this.events = []
      this.restarts++
      return
    }
    this.events.push(event)
  }

  get log(): readonly Event[] {
    return this.events
  }

  get size(): number {
    return this.events.length
  }

  clear(): void {
    this.events = []
  }
}

/**
 * Every distinct mission id that appears in a log, in first-seen order.
 *
 * A correct log has exactly one. More than one means two attempts were folded together
 * somewhere, which would make the summary a blend of two different levels — so the
 * export carries this list and the checks assert its length after a level switch.
 */
export function missionIdsIn(events: readonly Event[]): string[] {
  const ids: string[] = []
  for (const event of events) {
    if (event.kind !== 'mission_start' && event.kind !== 'mission_complete') continue
    if (!ids.includes(event.id)) ids.push(event.id)
  }
  return ids
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface StepSummary {
  step: number
  type: string
  /** null if the step was still open when the summary was taken. */
  outcome: Outcome | null
  durationMs: number | null
  hintsUsed: number
  maxHintLevel: 0 | 1 | 2 | 3
  /**
   * §4.4: **null** when the step ended `revealed` or `skipped`. A fast reveal must never
   * be able to look like a fast correct answer, so the two never share a field.
   */
  answerLatencyMs: number | null
  /** Time from `question_shown` to the reveal. Recorded separately, never folded in. */
  timeToRevealMs: number | null
  /** How many choices were tried. Nothing ever displays this as a count of mistakes. */
  selections: number
}

export interface Summary {
  missionId: string | null
  completed: boolean
  /** §4.4 `completionTime`, in ms of running time. null until the mission completes. */
  completionTimeMs: number | null
  hintsUsed: number
  maxHintLevel: 0 | 1 | 2 | 3
  roomsVisited: string[]
  /** §4.3 — all four, always present, never summed into a score. */
  outcomes: Record<Outcome, number>
  /**
   * Mean over the recall steps that produced one — with the single recall question v1
   * missions carry, simply that question's value. `recallAnswered` says how many went
   * into it, so a mean of one is never mistaken for a mean of several.
   */
  answerLatencyMs: number | null
  recallAnswered: number
  timeToRevealMs: number | null
  recallRevealed: number
  steps: StepSummary[]
  pauses: number
  /**
   * Total `room_enter` events, where `roomsVisited` is the distinct set.
   *
   * Level 2 walks the living room → kitchen → living room, so "rooms visited: 2" is
   * true but says nothing about the walking that was the whole level. Both numbers are
   * reported; neither is a substitute for the other.
   */
  roomEntries: number
}

interface OpenStep extends StepSummary {
  startedAt: number
  questionShownAt: number | null
  lastSelectionAt: number | null
}

const NO_OUTCOMES: Record<Outcome, number> = {
  independent: 0,
  cued: 0,
  revealed: 0,
  skipped: 0
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Folds a recorded log into §4.4's summary fields. Pure: same log, same summary.
 *
 * `answer_selected` carries no step index in §4.4's union, so it is attributed to the
 * step that is open when it arrives — which is exactly the step whose card is on screen.
 */
export function summarise(events: readonly Event[]): Summary {
  let missionId: string | null = null
  let missionStartedAt: number | null = null
  let completionTimeMs: number | null = null
  let completed = false
  let pauses = 0

  const rooms: string[] = []
  let roomEntries = 0
  const steps: StepSummary[] = []
  const outcomes: Record<Outcome, number> = { ...NO_OUTCOMES }
  let open: OpenStep | null = null

  const close = (endedAt: number, outcome: Outcome | null): void => {
    if (!open) return
    const { startedAt, questionShownAt, lastSelectionAt, ...rest } = open
    const step: StepSummary = { ...rest, outcome, durationMs: endedAt - startedAt }

    // §4.4's central rule about these two fields.
    if (outcome === 'independent' || outcome === 'cued') {
      if (questionShownAt !== null) {
        step.answerLatencyMs = (lastSelectionAt ?? endedAt) - questionShownAt
      }
    } else {
      step.answerLatencyMs = null
    }

    steps.push(step)
    if (outcome) outcomes[outcome]++
    open = null
  }

  for (const event of events) {
    switch (event.kind) {
      case 'mission_start':
        missionId = event.id
        missionStartedAt = event.t
        break

      case 'mission_complete':
        missionId = event.id
        completed = true
        completionTimeMs = missionStartedAt === null ? null : event.t - missionStartedAt
        break

      case 'step_start':
        close(event.t, null) // defensive: a step that never ended
        open = {
          step: event.step,
          type: event.type,
          outcome: null,
          durationMs: null,
          hintsUsed: 0,
          maxHintLevel: 0,
          answerLatencyMs: null,
          timeToRevealMs: null,
          selections: 0,
          startedAt: event.t,
          questionShownAt: null,
          lastSelectionAt: null
        }
        break

      case 'step_end':
        close(event.t, event.outcome ?? null)
        break

      case 'hint_shown':
        if (open) {
          open.hintsUsed++
          if (event.level > open.maxHintLevel) open.maxHintLevel = event.level
          // §5.4: level 3 on a recall step *is* the reveal. Measured from the moment the
          // question appeared, never from the moment the step began — the two differ by
          // however long the player spent walking to it.
          if (event.level === 3 && open.type === 'recall' && open.questionShownAt !== null) {
            open.timeToRevealMs = event.t - open.questionShownAt
          }
        }
        break

      case 'question_shown':
        if (open) open.questionShownAt = event.t
        break

      case 'answer_selected':
        if (open) {
          open.selections++
          open.lastSelectionAt = event.t
        }
        break

      case 'room_enter':
        roomEntries++
        if (!rooms.includes(event.room)) rooms.push(event.room)
        break

      case 'pause':
        pauses++
        break

      default:
        break
    }
  }

  const answered = steps.filter((s) => s.answerLatencyMs !== null)
  const revealed = steps.filter((s) => s.timeToRevealMs !== null)

  return {
    missionId,
    completed,
    completionTimeMs,
    hintsUsed: steps.reduce((total, s) => total + s.hintsUsed, 0),
    maxHintLevel: steps.reduce<0 | 1 | 2 | 3>((max, s) => (s.maxHintLevel > max ? s.maxHintLevel : max), 0),
    roomsVisited: rooms,
    outcomes,
    answerLatencyMs: mean(answered.map((s) => s.answerLatencyMs!)),
    recallAnswered: answered.length,
    timeToRevealMs: mean(revealed.map((s) => s.timeToRevealMs!)),
    recallRevealed: revealed.length,
    steps,
    pauses,
    roomEntries
  }
}

/** Total dwell per object, from the `object_dwell` events (§4.4 — dwell, not frames). */
export interface DwellTotal {
  id: string
  totalMs: number
  looks: number
}

export function dwellByObject(events: readonly Event[]): DwellTotal[] {
  const totals = new Map<string, DwellTotal>()
  for (const event of events) {
    if (event.kind !== 'object_dwell') continue
    const entry = totals.get(event.id) ?? { id: event.id, totalMs: 0, looks: 0 }
    entry.totalMs += event.ms
    entry.looks++
    totals.set(event.id, entry)
  }
  return [...totals.values()].sort((a, b) => b.totalMs - a.totalMs)
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportContext {
  /** Which pack the content came from — `?patient=` (§6 Checkpoint C). */
  patientId: string
  patientName?: string
  content?: { profileId: string; personIds: string[]; memoryIds: string[]; recallSkipped: boolean; questions: { id: string; contentId: string; stepIndex: number }[] }
  /** Which level: its mission id, its position in the pack, and its title. */
  levelId: string | null
  levelIndex: number | null
  levelTitle: string | null
  /** Identifies this attempt uniquely within the page-load. */
  attemptId: string
  /** 1 for the first attempt of the page-load, counting across all levels. */
  attemptNumber: number
  /** How many times this page-load restarted before the session being exported. */
  restarts: number
  /** SPEC.md §10.8 — carried straight from the active pack's own `provenance` field
   *  when it has one (type-only import: erased at build time). Session telemetry
   *  itself (§4.4) is unchanged either way — this is purely passed through. */
  provenance?: import('./agent/provenance').ProvenanceBlock
}

export interface ExportDocument {
  format: 'memoria-telemetry'
  version: 1
  generatedAt: string
  /**
   * §4.4: "Claim nothing clinical." The label travels with the file, not only on the
   * screen — a JSON handed to somebody else arrives without the screen around it.
   */
  notDiagnostic: string
  comparability: string
  patient: { id: string; name?: string }
  content?: ExportContext['content']
  /** Which of the pack's levels this attempt played. */
  level: { id: string | null; index: number | null; title: string | null }
  /** Kept as an alias of `level` for anything reading the pre-levels export shape. */
  mission: { id: string | null; title: string | null }
  session: {
    attemptId: string
    attemptNumber: number
    restarts: number
    events: number
    /**
     * Every mission id in the log. One entry means this file describes one attempt at
     * one level, which is the only correct value — it is written out rather than
     * assumed so a reader can check rather than trust.
     */
    missionIdsInLog: string[]
  }
  summary: Summary
  dwellByObject: DwellTotal[]
  events: Event[]
  /** SPEC.md §10.8. Absent for a hand-authored or caregiver-editor pack — present only
   *  when the played pack was agent-assisted and the caregiver confirmed it on commit. */
  provenance?: import('./agent/provenance').ProvenanceBlock
}

export function buildExport(events: readonly Event[], context: ExportContext): ExportDocument {
  const summary = summarise(events)
  const inLog = missionIdsIn(events)
  if (inLog.length > 1) {
    // Loud, because a blended log makes every number below meaningless. The file is
    // still written: withholding a caregiver's data to punish a bug helps nobody, and
    // `missionIdsInLog` puts the problem on the face of the document.
    console.error('[memoria] export spans more than one mission id:', inLog)
  }
  return {
    format: 'memoria-telemetry',
    version: 1,
    generatedAt: new Date().toISOString(),
    notDiagnostic: NOT_DIAGNOSTIC,
    comparability: 'Compare only against the same patient’s past sessions.',
    patient: { id: context.patientId, ...(context.patientName !== undefined ? { name: context.patientName } : {}) },
    content: context.content,
    level: {
      // The log's own mission id wins over the caller's: it is what was actually played.
      id: summary.missionId ?? context.levelId,
      index: context.levelIndex,
      title: context.levelTitle
    },
    mission: { id: summary.missionId ?? context.levelId, title: context.levelTitle },
    session: {
      attemptId: context.attemptId,
      attemptNumber: context.attemptNumber,
      restarts: context.restarts,
      events: events.length,
      missionIdsInLog: inLog
    },
    summary,
    dwellByObject: dwellByObject(events),
    events: [...events],
    ...(context.provenance !== undefined ? { provenance: context.provenance } : {})
  }
}

/**
 * Filesystem-safe, sortable, and says whose session it is and which level, at a glance.
 * With three levels and replays, a folder of downloads is otherwise a row of timestamps.
 */
export function exportFilename(patientId: string, levelId: string | null, at = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  const level = (levelId ?? 'session').replace(/[^a-z0-9-]/gi, '-')
  return `memoria-${patientId}-${level}-${stamp}.json`
}

/** Hands the browser a file. Returns the JSON text, so callers can log or copy it. */
export function downloadJson(document_: ExportDocument, filename: string): string {
  const text = JSON.stringify(document_, null, 2)
  try {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoked on the next turn of the event loop — revoking synchronously races the
    // click in some browsers and produces an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {
    console.error('[memoria] export failed', error)
  }
  return text
}
