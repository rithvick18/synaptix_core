/**
 * SPEC.md §5.1 — state machine and timers.
 *
 * The rule that shapes this file: entering `answering` must NOT stop the clock. Only
 * `paused` and `completed` do. Hint and response timers therefore read `elapsed()`,
 * which advances in `exploring` and `answering` and freezes otherwise.
 */

export type GameState = 'exploring' | 'answering' | 'paused' | 'completed'

const TIMERS_RUN: Record<GameState, boolean> = {
  exploring: true,
  answering: true,
  paused: false,
  completed: false
}

const MOVEMENT_ENABLED: Record<GameState, boolean> = {
  exploring: true,
  answering: false,
  paused: false,
  completed: false
}

/** Pointer lock is held only while exploring; `answering` unlocks intentionally. */
const POINTER_LOCK_WANTED: Record<GameState, boolean> = {
  exploring: true,
  answering: false,
  paused: false,
  completed: false
}

export type StateListener = (next: GameState, previous: GameState) => void

export class State {
  private state: GameState = 'exploring'
  private accumulatedMs = 0
  private markedAt = performance.now()
  private expectingUnlock = false
  private listeners: StateListener[] = []

  /** State before the last `pause()`, so `resume()` can return to `answering` (§5.1). */
  private stateBeforePause: GameState = 'exploring'

  get current(): GameState {
    return this.state
  }

  get movementEnabled(): boolean {
    return MOVEMENT_ENABLED[this.state]
  }

  get pointerLockWanted(): boolean {
    return POINTER_LOCK_WANTED[this.state]
  }

  get timersRunning(): boolean {
    return TIMERS_RUN[this.state]
  }

  /** Milliseconds of running time — paused and completed time is never counted. */
  elapsed(): number {
    const now = performance.now()
    return this.accumulatedMs + (TIMERS_RUN[this.state] ? now - this.markedAt : 0)
  }

  resetTimers(): void {
    this.accumulatedMs = 0
    this.markedAt = performance.now()
  }

  onChange(listener: StateListener): void {
    this.listeners.push(listener)
  }

  set(next: GameState): void {
    if (next === this.state) return
    const now = performance.now()
    if (TIMERS_RUN[this.state]) this.accumulatedMs += now - this.markedAt
    this.markedAt = now
    const previous = this.state
    this.state = next
    for (const l of this.listeners) l(next, previous)
  }

  pause(): void {
    if (this.state === 'paused' || this.state === 'completed') return
    this.stateBeforePause = this.state
    this.set('paused')
  }

  /**
   * §5.1: resuming from a paused answer screen returns to `answering` with the pointer
   * still unlocked — re-locking only happens on the way back to `exploring`.
   */
  resume(): void {
    if (this.state !== 'paused') return
    this.set(this.stateBeforePause === 'answering' ? 'answering' : 'exploring')
  }

  /**
   * §5.1: showing an answer card releases the pointer deliberately. Set this flag
   * immediately before the release; the `pointerlockchange` handler swallows exactly
   * one exit instead of treating it as a pause.
   */
  markExpectingUnlock(): void {
    this.expectingUnlock = true
  }

  /** Returns true if this unlock was the expected one, and clears the flag. */
  consumeExpectedUnlock(): boolean {
    if (!this.expectingUnlock) return false
    this.expectingUnlock = false
    return true
  }
}
