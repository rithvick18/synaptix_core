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
