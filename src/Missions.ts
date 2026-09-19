import * as THREE from 'three'
import type { PackMedia, PackVoices } from './MemoryPack'
import type { Player } from './Player'
import type { State } from './State'
import type { Outcome, Telemetry } from './Telemetry'
import type { WorldSource } from './World'
import type { ChoiceCard, UI } from './ui'

/**
 * SPEC.md §5.4 / §5.5 / §5.6 — the mission step runner.
 *
 * Three step types, a three-level hint ladder whose level-3 behaviour depends on the step
 * type, skip, and the containment test that keeps a navigate step from hanging when the
 * player is already standing in the target room.
 *
 * §2's hard product rule is why this file contains almost no prose: every instruction,
 * hint and choice string is read from the pack. The two engine-authored strings are the
 * positional "Step n of m" label and the neutral nudge after a choice that was not the
 * answer — neither is autobiographical content, and neither says "wrong".
 */

// ---------------------------------------------------------------------------
// Pack shape — §4.1, exactly.
//
// These are the *validated* shapes. Checkpoint C's MemoryPack.ts is the only thing that
// constructs them, and it does so only after §4.2 has passed, so the runner below never
// re-checks a reference: by the time a `Step` exists, its room, object and highlight ids
// are known to be present in the active world and its choices are known to name people.
// ---------------------------------------------------------------------------

export interface Person {
  id: string
  name: string
  relationship: string
  photo?: string
  voice?: string
}

export interface StepHints {
  repeat: string
  highlight: string
  guide: string
}

export interface NavigateStep {
  type: 'navigate'
  targetRoom: string
  instruction: string
  hints: StepHints
}

export interface FindStep {
  type: 'find'
  targetObject: string
  instruction: string
  hints: StepHints
}

export interface RecallStep {
  type: 'recall'
  question: string
  choices: string[]
  answer: string
  reducedChoices?: string[]
  hints: StepHints
}

export type Step = NavigateStep | FindStep | RecallStep

export interface Mission {
  id: string
  title: string
  steps: Step[]
}

export interface MemoryPack {
  patient: { name: string }
  people: Person[]
  anchors: Record<string, string>
  missions: Mission[]
}

// ---------------------------------------------------------------------------
// Hint ladder timings — §5.4's "~20 s / ~45 s / ~75 s", measured from step start on
// State.elapsed(), which runs in `exploring` and `answering` and freezes in `paused`.
// ---------------------------------------------------------------------------

export const HINT_DELAYS_MS: readonly [number, number, number] = [20_000, 45_000, 75_000]

/** What the player is asked at this step — the string that is shown and spoken. */
export function instructionOf(step: Step): string {
  return step.type === 'recall' ? step.question : step.instruction
}

// ---------------------------------------------------------------------------
// Speech
//
// §5.4 level 1 is "shown and spoken". This uses the browser's own speech synthesis, not
// a pack audio file: recorded caregiver voice is pack media and belongs to Checkpoint C.
// Silently absent where the API is not available, per §1.1's degradation contract.
// ---------------------------------------------------------------------------

function speak(text: string, onEnd?: () => void): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth) {
    // Absent speech must not swallow whatever was queued behind it.
    onEnd?.()
    return
  }
  try {
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.92
    if (onEnd) {
      // `cancel()` also ends an utterance, so `onEnd` fires on interruption as well as
      // on completion. Callers guard against acting on a step that has since moved on.
      utterance.onend = () => onEnd()
      utterance.onerror = () => onEnd()
    }
    synth.speak(utterance)
  } catch {
    onEnd?.()
  }
}

/** §5.6 resets audio playback. */
export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Hint beacon — the level-2 highlight
//
// Deliberately *not* the material swap Interaction.ts uses for focus (§5.3). That swap
// stores and restores a mesh's own materials; running a second, longer-lived swap over
// the same object would have the two restore each other's clones. A separate box drawn
// around the target's bounding volume touches no material at all, survives a door
// swinging mid-hint, and is removed by dropping one object from the scene.
//
// Depth-tested on purpose: the beacon does not shine through walls. Level 2 makes the
// target obvious once it is in view; level 3 is the step that says where to go.
// ---------------------------------------------------------------------------

const BEACON_COLOUR = 0xffc45e

class HintBeacon {
  private group = new THREE.Group()
  private box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: BEACON_COLOUR,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  )
  private edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: BEACON_COLOUR, transparent: true, opacity: 0.9 })
  )

  private target: THREE.Object3D | null = null
  private bounds = new THREE.Box3()
  private size = new THREE.Vector3()
  private centre = new THREE.Vector3()

  constructor(parent: THREE.Object3D) {
    this.group.name = 'hint-beacon'
    this.group.visible = false
    // renderOrder is per-object in three.js, not inherited from a parent group.
    this.box.renderOrder = 2
    this.edges.renderOrder = 3
    this.group.add(this.box, this.edges)
    parent.add(this.group)
  }

  show(target: THREE.Object3D | undefined): void {
    if (!target) return
    this.target = target
    this.group.visible = true
    this.fit()
  }

  hide(): void {
    this.target = null
    this.group.visible = false
  }

  /** Re-fits every frame so a hinted door keeps its beacon while it swings. */
  update(elapsedMs: number): void {
    if (!this.target) return
    this.fit()
    const pulse = 0.5 + 0.5 * Math.sin(elapsedMs / 420)
    ;(this.box.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.12 * pulse
    ;(this.edges.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.4 * pulse
  }

  private fit(): void {
    if (!this.target) return
    this.bounds.setFromObject(this.target)
    if (this.bounds.isEmpty()) return
    this.bounds.expandByScalar(0.05)
    this.bounds.getSize(this.size)
    this.bounds.getCenter(this.centre)
    this.group.position.copy(this.centre)
    this.group.scale.set(
      Math.max(this.size.x, 0.02),
      Math.max(this.size.y, 0.02),
      Math.max(this.size.z, 0.02)
    )
  }
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export interface MissionRunnerDeps {
  pack: MemoryPack
  mission: Mission
  world: WorldSource
  player: Player
  state: State
  telemetry: Telemetry
  ui: UI
  /** What actually loaded (§4.2) — photos, voices, and each question's card style. */
  media: PackMedia
  /** Positional playback of the pack's voices, mounted on the `audioSource` anchor. */
  voices: PackVoices
}

/** Engine chrome, not memory content: neutral, never "wrong", never a tally. */
const NEUTRAL_NUDGE = 'Take your time — have another look.'

export class MissionRunner {
  private index = -1
  private hintLevel: 0 | 1 | 2 | 3 = 0
  private startedAt = 0
  private running = false
  private revealed = false
  private beacon: HintBeacon
  private people = new Map<string, Person>()

  /** One entry per finished step, in order. Checkpoint D aggregates from the event log. */
  readonly outcomes: (Outcome | null)[]

  constructor(private deps: MissionRunnerDeps) {
    this.beacon = new HintBeacon(deps.world.root)
    this.outcomes = deps.mission.steps.map(() => null)
    for (const person of deps.pack.people) this.people.set(person.id, person)
  }

  get steps(): Step[] {
    return this.deps.mission.steps
  }

  get current(): Step | null {
    return this.running ? (this.steps[this.index] ?? null) : null
  }

  get stepIndex(): number {
    return this.index
  }

  get level(): 0 | 1 | 2 | 3 {
    return this.hintLevel
  }

  get active(): boolean {
    return this.running
  }

  // --- Lifecycle ---------------------------------------------------------------

  start(): void {
    this.running = true
    this.outcomes.fill(null)
    this.deps.telemetry.missionStart(this.deps.mission.id)
    this.beginStep(0)
  }

  /** §5.6 — everything the runner owns, back to nothing. `start()` then re-runs §5.5. */
  reset(): void {
    this.running = false
    this.index = -1
    this.hintLevel = 0
    this.revealed = false
    this.startedAt = 0
    this.outcomes.fill(null)
    this.beacon.hide()
    stopSpeaking()
    this.deps.voices.stop()
    this.deps.ui.hideAnswerCard()
    this.deps.ui.hideInstruction()
    this.deps.ui.setHint(null)
  }

  /** Called once per frame from the game loop, in every state. */
  update(): void {
    if (!this.running) return
    const step = this.current
    if (!step) return
    // §5.1: `elapsed()` freezes in `paused` and `completed`, so the ladder stops there
    // on its own — and keeps running in `answering`, which is the point.
    if (this.deps.state.timersRunning) {
      const since = this.deps.state.elapsed() - this.startedAt
      while (this.hintLevel < 3 && since >= HINT_DELAYS_MS[this.hintLevel as 0 | 1 | 2]) {
        this.showHint((this.hintLevel + 1) as 1 | 2 | 3)
      }
    }
    this.beacon.update(this.deps.state.elapsed())
  }

  // --- Signals from the game loop ------------------------------------------------

  /** The player's room changed. Fires `room_enter` and may complete a navigate step. */
  notifyRoom(room: string | null): void {
    if (room) this.deps.telemetry.roomEnter(room)
    const step = this.current
    if (step?.type === 'navigate' && room === step.targetRoom) this.endStep(this.performedOutcome())
  }

  /** The player pressed E on an interactable. May complete a find step. */
  notifyInteract(id: string): void {
    const step = this.current
    const correct = step?.type === 'find' && step.targetObject === id
    this.deps.telemetry.objectInteract(id, correct)
    if (correct) this.endStep(this.performedOutcome())
  }

  /** §5.4: "Skip is always available." */
  skip(): void {
    if (!this.current) return
    this.endStep('skipped')
  }

  // --- Steps ----------------------------------------------------------------------

  private beginStep(index: number): void {
    this.index = index
    this.hintLevel = 0
    this.revealed = false
    const step = this.steps[index]
    if (!step) {
      this.complete()
      return
    }

    this.startedAt = this.deps.state.elapsed()
    this.deps.telemetry.stepStart(index, step.type)

    const text = instructionOf(step)
    this.deps.ui.setHint(null)
    this.deps.ui.showInstruction(`Step ${index + 1} of ${this.steps.length}`, text)
    speak(text)

    if (step.type === 'recall') {
      const cards = this.choiceCards(step.choices)
      // §4.2's last resort: "All choice rendering fails → skip the step, outcome
      // `skipped`." Validation rejects a pack whose choices name nobody, so this is
      // defensive rather than routine — but a question with nothing on it must not sit
      // on screen waiting for a click that can never come.
      if (cards.length === 0) {
        console.warn('[smriti] no renderable choices for this question; skipping the step')
        this.endStep('skipped')
        return
      }
      this.openAnswerCard(step, cards)
      return
    }

    this.leaveAnswering()

    // §5.5 — containment at step start, not a future entry event. A player already
    // standing in the target room finishes here and now; waiting for `room_enter` when
    // no boundary is going to be crossed is the hang this exists to prevent.
    if (step.type === 'navigate') {
      const room = this.deps.world.roomOf(this.deps.player.groundPoint())
      if (room === step.targetRoom) {
        this.endStep('independent')
        return
      }
    }
  }

  private endStep(outcome: Outcome): void {
    const index = this.index
    const step = this.steps[index]
    if (!step) return

    this.outcomes[index] = outcome
    this.beacon.hide()
    stopSpeaking()
    this.deps.ui.setHint(null)
    this.deps.ui.hideAnswerCard()
    this.deps.telemetry.stepEnd(index, step.type, outcome)

    this.beginStep(index + 1)
  }

  /**
   * §4.3: correct with no hint is `independent`; correct after any hint is `cued` —
   * including after level-3 guidance, because on a navigate or find step the player
   * still had to walk there or press E themselves.
   */
  private performedOutcome(): Outcome {
    return this.hintLevel === 0 ? 'independent' : 'cued'
  }

  private complete(): void {
    this.running = false
    this.beacon.hide()
    stopSpeaking()
    this.deps.ui.hideAnswerCard()
    this.deps.ui.hideInstruction()
    this.deps.ui.setHint(null)
    // Checkpoint B ended here with a placeholder completion screen. §4.4's real summary
    // is computed from the recorded event log, so it is rendered by whoever is listening
    // on the telemetry seam — the runner's job is to say that the mission finished.
    this.deps.telemetry.missionComplete(this.deps.mission.id)
    this.deps.state.set('completed')
    this.deps.player.releaseLock()
  }

  // --- Hint ladder (§5.4) ------------------------------------------------------------

  private showHint(level: 1 | 2 | 3): void {
    const step = this.current
    if (!step) return
    this.hintLevel = level
    this.deps.telemetry.hintShown(level, this.index)

    if (level === 1) {
      // Repeat the instruction, shown and spoken. Identical for all three step types.
      this.setHintText(step.hints.repeat)
      speak(step.hints.repeat)
      return
    }

    if (level === 2) {
      if (step.type === 'recall') {
        // Swap to the reduced choices, always keeping the answer.
        this.deps.ui.updateAnswerCard({
          choices: this.choiceCards(this.reduce(step)),
          note: null
        })
      } else {
        this.beacon.show(this.deps.world.hintTargets[step.hints.highlight])
        if (!this.deps.world.hintTargets[step.hints.highlight]) {
          console.warn(`[smriti] hint target missing from world: ${step.hints.highlight}`)
        }
      }
      // The pack's own words stay on screen; the added assistance is visual.
      this.setHintText(step.hints.repeat)
      return
    }

    // Level 3 — the branch the whole table exists for.
    this.setHintText(step.hints.guide)

    if (step.type !== 'recall') {
      // navigate / find: show guidance and speak it, then wait. Nothing completes here
      // — the player still has to walk into the room or press E on the object, and
      // doing so scores `cued` (§4.3). Skip stays available.
      speak(step.hints.guide)
      return
    }

    // Reveal the answer. The step may now end as `revealed`. The card is marked before
    // anything is spoken, so the state the callback below tests is already settled.
    this.revealed = true
    this.deps.ui.updateAnswerCard({ revealedId: step.answer, note: null })

    // "It was Ananya, your granddaughter." — and then Ananya, in her own voice.
    // Chained rather than simultaneous: two voices at once is the one thing a person
    // with dementia can least afford to untangle. Cancelling an utterance also fires
    // its `onend`, so the callback re-checks that the step it belongs to is still the
    // one on screen before playing anything.
    const at = this.index
    speak(step.hints.guide, () => {
      if (this.running && this.index === at && this.revealed) this.deps.voices.play(step.answer)
    })
  }

  private setHintText(text: string): void {
    this.deps.ui.setHint(text)
    if (this.deps.ui.answerCardVisible) this.deps.ui.updateAnswerCard({ note: null })
  }

  // --- Recall ------------------------------------------------------------------------

  private openAnswerCard(step: RecallStep, cards: ChoiceCard[]): void {
    // §5.1: freeze movement and release the pointer *deliberately*. `releaseLock()` sets
    // `expectingUnlock` first, so the pointerlockchange handler does not read this as a
    // pause. Timers keep running — `answering` does not stop the clock.
    this.deps.state.set('answering')
    this.deps.player.releaseLock()

    this.deps.ui.showAnswerCard({
      question: step.question,
      choices: cards,
      revealedId: null,
      note: null,
      onSelect: (id) => this.onChoice(step, id),
      onSkip: () => this.skip(),
      onContinue: () => this.endStep('revealed')
    })
    this.deps.telemetry.questionShown(this.index)
  }

  private onChoice(step: RecallStep, id: string): void {
    const correct = id === step.answer
    this.deps.telemetry.answerSelected(id, correct)

    // Every card speaks with its own voice, whichever one was picked. Playing the voice
    // only for the answer would be a correctness signal, which §5.4 rules out as surely
    // as a red cross does. Missing voice → silence (§4.2), never a beep or a buzz.
    this.deps.voices.play(id)

    if (this.revealed) {
      // The answer was already given, so this is not the player recalling it (§4.3).
      this.endStep('revealed')
      return
    }
    if (correct) {
      this.endStep(this.performedOutcome())
      return
    }
    // §5.4: nothing ever shows "wrong". The card stays, every choice stays enabled.
    this.deps.ui.updateAnswerCard({ note: NEUTRAL_NUDGE })
  }

  /**
   * §5.4 level 2 for recall: keep the answer, remove a distractor deterministically.
   * §4.2: a `reducedChoices` that has lost the answer is ignored with a warning — so the
   * fallback has to be deterministic too. It drops the last distractor in declaration
   * order, which is the same choice on every run and every machine.
   */
  private reduce(step: RecallStep): string[] {
    const supplied = step.reducedChoices
    if (supplied && supplied.includes(step.answer)) {
      const kept = supplied.filter((id) => step.choices.includes(id))
      if (kept.includes(step.answer) && kept.length >= 2) return kept
    }
    if (supplied) console.warn('[smriti] reducedChoices unusable, reducing deterministically')

    const distractors = step.choices.filter((id) => id !== step.answer)
    if (distractors.length === 0) return [...step.choices]
    const dropped = distractors[distractors.length - 1]
    return step.choices.filter((id) => id !== dropped)
  }

  /**
   * §4.2: "**Any** recall photo fails to load → apply the same text-only card style to
   * every choice in that question. Never mix photo and text cards — the odd one out
   * identifies the answer."
   *
   * The decision is not taken here. MemoryPack settles it once per question, over the
   * question's full choice list, after every photo has either decoded or failed; this
   * only reads it. That matters because level 2 re-renders the card with a *subset* of
   * the choices, and the style must not change halfway through a question. The UI
   * re-checks the invariant independently when it renders.
   *
   * A choice with no person behind it is dropped rather than rendered as a bare id.
   * Validation rejects such a pack outright, so the only way to reach that is a world
   * and pack that disagree at runtime — and an empty list is what `beginStep` reads as
   * §4.2's "all choice rendering fails".
   */
  private choiceCards(ids: string[]): ChoiceCard[] {
    const style = this.deps.media.cardStyle(this.deps.mission.id, this.index)
    const cards: ChoiceCard[] = []
    for (const id of ids) {
      const person = this.people.get(id)
      if (!person) {
        console.warn(`[smriti] choice id absent from people, dropping it: ${id}`)
        continue
      }
      cards.push({
        id: person.id,
        name: person.name,
        relationship: person.relationship,
        photoUrl: style === 'photo' ? this.deps.media.photoFor(person.id) : null,
        // Present whether or not the card shows a photo: a text card can still speak.
        hasVoice: this.deps.media.voiceFor(person.id) !== null
      })
    }
    return cards
  }

  /** Back to walking: re-lock only on the way into `exploring`, per §5.1. */
  private leaveAnswering(): void {
    this.deps.state.set('exploring')
    if (!this.deps.ui.overlayVisible) this.deps.player.requestLock()
  }
}
