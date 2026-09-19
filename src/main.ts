import * as THREE from 'three'
import { Interaction } from './Interaction'
import {
  PackRejected,
  PackVoices,
  breakagesFromLocation,
  injectAnchors,
  loadPack,
  patientIdFromLocation,
  type LoadedPack
} from './MemoryPack'
import { MissionRunner, stopSpeaking, type Mission } from './Missions'
import { Player } from './Player'
import { Renderer } from './Renderer'
import { State } from './State'
import {
  DWELL_THRESHOLD_MS,
  NOT_DIAGNOSTIC,
  Recorder,
  Telemetry,
  buildExport,
  downloadJson,
  exportFilename,
  summarise,
  type Event
} from './Telemetry'
import { UI, type LoadStage } from './ui'
import { assertWorldContract } from './World'
import { createProceduralHouse } from './proceduralHouse'

/**
 * SPEC.md §3 — entry and game loop.
 *
 * Checkpoint A: scaffold, renderer, procedural world, movement, one interaction.
 * Checkpoint B adds the mission runner, the hint ladder, the answer card, skip, restart
 * and the telemetry hook call sites.
 * Checkpoint C replaces B's bundled fixture with a real caregiver pack, chosen by
 * `?patient=`, validated per §4.2 and injected into the world as photographs and voice.
 * Checkpoint D records the events B's hooks emit, aggregates them into §4.4's summary,
 * exports the whole session as JSON, and turns the loading screen into staged item
 * counts.
 *
 * The three-level expansion turns the single mission into a chosen one. A level is a
 * mission; an attempt is one play of a level; and `startLevel` is the only way to open
 * an attempt, which is what makes "never combine events from different attempts" true
 * by construction rather than by care — it tears the previous runner down, resets
 * everything §5.6 lists, and opens a fresh log before the new runner exists.
 */

const FRAME_WARMUP = 30
const FRAME_SAMPLES = 300

interface PerfResult {
  medianMs: number
  p95Ms: number
  frames: number
  drawCalls: number
  triangles: number
  programs: number
  resolution: string
  pixelRatio: number
  userAgent: string
}

/** What `debug.canFocus` reports: can a player stand somewhere and focus this object? */
interface FocusProbe {
  id: string
  ok: boolean
  /** The nearest standable spot it focused from. */
  from?: { x: number; z: number }
  room?: string | null
  distance?: number
  prompt?: string | null
  reason?: string
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

const CONTROLS_PLAYING =
  '<span class="keycap">W A S D</span> walk · <span class="keycap">E</span> interact · ' +
  '<span class="keycap">K</span> skip this step · <span class="keycap">R</span> replay level · ' +
  '<span class="keycap">L</span> levels · <span class="keycap">J</span> export JSON · ' +
  '<span class="keycap">Esc</span> pause'
const CONTROLS_DONE =
  '<span class="keycap">R</span> replay level · <span class="keycap">L</span> levels · ' +
  '<span class="keycap">J</span> export JSON'

async function boot(): Promise<void> {
  const app = document.getElementById('app')!
  const ui = new UI(app)

  // §6 Checkpoint C: `?patient=raju` changes photos, audible voice and name. The id is
  // a path segment, so MemoryPack validates its shape before interpolating it.
  const patientId = patientIdFromLocation(location.search)
  const breakages = breakagesFromLocation(location.search)

  /**
   * §6 Checkpoint D's loading screen: stage plus asset count. Every denominator below
   * is a number of *files this build actually asks for*, known before the first request
   * — 12 texture maps, 1 HDRI, 1 pack manifest, and however many photographs and voice
   * clips the chosen pack names. Nothing here is derived from bytes, because nothing
   * measures bytes: `Content-Length` is absent on the CDN responses and a percentage
   * invented from a guess is worse than a count.
   */
  const stages: LoadStage[] = [
    { id: 'textures', label: 'Surface textures', state: 'waiting', counts: null },
    { id: 'hdri', label: 'Environment lighting', state: 'waiting', counts: null },
    { id: 'house', label: 'Building the house', state: 'waiting', counts: null, note: null },
    { id: 'pack', label: 'Memory pack', state: 'waiting', counts: null },
    { id: 'media', label: 'Photographs and voices', state: 'waiting', counts: null }
  ]

  const progress = (id: string, done: number, failed: number, total: number): void => {
    const stage = stages.find((s) => s.id === id)
    if (!stage) return
    // A stage with no files to fetch (geometry) reports totals of 0 and shows no count.
    stage.counts = total > 0 ? { done, failed, total } : null
    stage.state = total > 0 && done + failed >= total ? 'done' : total === 0 && done > 0 ? 'done' : 'active'
    for (const earlier of stages) {
      if (earlier === stage) break
      if (earlier.state === 'waiting') earlier.state = 'done'
    }
    const active = stages.find((s) => s.state === 'active')
    ui.showLoadingStages(active ? `${active.label}…` : 'Almost ready…', stages)
  }

  ui.showLoadingStages('Starting…', stages)

  const renderer = new Renderer(app)
  const state = new State()

  // Both downloads are optional by contract (§1.1); neither can fail the boot.
  const [{ world, report }, envReport] = await Promise.all([
    createProceduralHouse(progress),
    renderer.setupEnvironment(progress)
  ])
  assertWorldContract(world)
  renderer.scene.add(world.root)
  renderer.refreshShadows()

  const player = new Player(renderer.camera, renderer.renderer.domElement, state, world.blockers)
  player.teleport(world.spawn.position, world.spawn.yaw)

  const interaction = new Interaction(world)

  // Positional audio needs a listener on the camera, and the pack's voices play from
  // the world's `audioSource` anchor (§1) — the radio in the living room.
  const listener = new THREE.AudioListener()
  renderer.camera.add(listener)
  const voices = new PackVoices(listener, world.anchors.audioSource)

  // §4.2 — fetch, validate, load media. A pack that cannot be run stops here with the
  // whole list of problems on screen; the house still renders behind it so it is
  // obvious the engine is fine and the *pack* is not.
  let loaded: LoadedPack
  try {
    loaded = await loadPack(patientId, world, { breakages, onProgress: progress })
  } catch (error) {
    if (!(error instanceof PackRejected)) throw error
    console.error('[smriti] pack rejected', error.problems)
    ui.showRejection(
      `Pack "${error.patientId}" was not loaded`,
      `${error.rejections.length} problem(s) must be fixed before this pack can run. ` +
        'All of them are listed — none depends on another being fixed first.',
      error.problems,
      'Fix the pack and reload · <span class="keycap">?patient=</span> chooses a pack'
    )
    ;(window as unknown as { __smriti: unknown }).__smriti = { world, renderer, ui, rejected: error }
    renderOnly(renderer, world)
    return
  }

  const { pack, media } = loaded
  voices.use(media)
  // Anchor textures and framed photos are the same injection in this world: both §1
  // anchors (`livingRoomWall`, `bedsideFrame`) are picture frames.
  const injectionProblems = injectAnchors(world, media)
  const warnings = [...loaded.problems, ...injectionProblems]
  for (const problem of warnings) {
    console.warn(`[smriti] pack warning · ${problem.where} · ${problem.message}`)
  }
  document.title = `Smriti — ${pack.patient.name}`

  // §4.4: every `t` rides State.elapsed(), the clock that stops in `paused`. Because
  // every stamp is already on that clock, every duration derived from them is already
  // free of paused time — §4.4's "subtract paused time" needs no subtraction step.
  const telemetry = new Telemetry(() => state.elapsed())
  const recorder = new Recorder()

  telemetry.onEvent = (event: Event) => {
    // Checkpoint D plugs into the seam B left. The `restart` event is what clears the
    // log (§5.6); `Recorder` handles that, so nothing here has to remember to.
    recorder.record(event)
    console.log('[smriti]', event.kind, event)
    ui.log(describe(event))
    if (event.kind === 'mission_complete') {
      // The level list marks what has been played through at least once this session.
      finished.add(event.id)
      showSummary()
    }
  }

  // --- Levels ---------------------------------------------------------------------
  //
  // A level is a mission. `startLevel` is the only way to open an attempt at one, and it
  // is where every §5.6 reset lives, so there is no path that carries hint state, audio,
  // a highlight, a position, a timer or an event from one attempt into the next.

  const levels = pack.missions
  let runner: MissionRunner | null = null
  let levelIndex = -1
  let attemptId = ''
  const finished = new Set<string>()

  /** Overlays that own the pointer. A background click must not act while one is up. */
  let overlayMode: 'none' | 'levels' | 'summary' | 'paused' = 'none'

  const levelLabel = (index: number): string =>
    `Level ${index + 1} of ${levels.length} · ${levels[index].title}`

  /**
   * "6 steps · 3 to walk to · 3 to find" — engine chrome counted from the mission, not
   * pack prose, and deliberately literal about what the player does. The player walks to
   * a room and looks at an object; nothing here is carried, poured or switched on, so
   * nothing here says so.
   */
  const shapeOf = (mission: Mission): string => {
    const count = (type: string): number => mission.steps.filter((s) => s.type === type).length
    const parts: string[] = []
    if (count('navigate') > 0) parts.push(`${count('navigate')} to walk to`)
    if (count('find') > 0) parts.push(`${count('find')} to find`)
    if (count('recall') > 0) parts.push(`${count('recall')} question${count('recall') > 1 ? 's' : ''}`)
    return `${mission.steps.length} steps · ${parts.join(' · ')}`
  }

  // --- §4.4 summary and export ---------------------------------------------------

  const seconds = (value: number | null): string =>
    value === null ? '—' : `${(value / 1000).toFixed(1)}s`

  const exportContext = () => ({
    patientId: loaded.patientId,
    patientName: pack.patient.name,
    levelId: levels[levelIndex]?.id ?? null,
    levelIndex: levelIndex >= 0 ? levelIndex : null,
    levelTitle: levels[levelIndex]?.title ?? null,
    attemptId,
    attemptNumber: recorder.attempts,
    restarts: recorder.restarts
  })

  const exportSession = (): string => {
    const doc = buildExport(recorder.log, exportContext())
    const name = exportFilename(loaded.patientId, doc.level.id)
    downloadJson(doc, name)
    console.log('[smriti] exported', name, doc)
    return name
  }

  /**
   * §4.4's summary, rendered from the recorded log rather than from anything the mission
   * runner remembers. The three rules it has to keep are all about *not* saying things:
   * the four outcomes stay separate, `answerLatency` is an em dash rather than a number
   * on a revealed or skipped step, and the not-diagnostic label is on the screen.
   */
  const showSummary = (): void => {
    const summary = summarise(recorder.log)

    const latencyNote =
      summary.recallAnswered === 0
        ? 'null — the step ended revealed or skipped'
        : summary.recallAnswered > 1
          ? `mean of ${summary.recallAnswered}`
          : null
    const revealNote =
      summary.recallRevealed === 0
        ? 'no answer was revealed'
        : summary.recallRevealed > 1
          ? `mean of ${summary.recallRevealed}`
          : null

    const mission = levels[levelIndex]
    const next = levelIndex >= 0 && levelIndex + 1 < levels.length ? levelIndex + 1 : null

    ui.showSummary({
      title: mission ? `${levelLabel(levelIndex)}` : 'Session so far',
      subtitle:
        `${pack.patient.name} · ` +
        (summary.completed ? 'level finished' : 'attempt so far') +
        ` · attempt ${recorder.attempts}` +
        (summary.pauses > 0 ? ` · paused ${summary.pauses}×` : ''),
      // §4.3: four values, never merged, and never added into a score.
      outcomes: [
        { label: 'independent', count: summary.outcomes.independent },
        { label: 'cued', count: summary.outcomes.cued },
        { label: 'revealed', count: summary.outcomes.revealed },
        { label: 'skipped', count: summary.outcomes.skipped }
      ],
      measures: [
        { label: 'completion time', value: seconds(summary.completionTimeMs) },
        { label: 'hints used', value: String(summary.hintsUsed) },
        { label: 'highest hint level', value: String(summary.maxHintLevel) },
        {
          label: 'rooms visited',
          value: String(summary.roomsVisited.length),
          // Level 2 walks the living room → kitchen → living room. "2 rooms" is true and
          // says nothing about that, so the number of entries is reported beside it.
          note:
            (summary.roomsVisited.join(', ') || null) &&
            `${summary.roomsVisited.join(', ')} · ${summary.roomEntries} entries`
        },
        { label: 'answer latency', value: seconds(summary.answerLatencyMs), note: latencyNote },
        { label: 'time to reveal', value: seconds(summary.timeToRevealMs), note: revealNote }
      ],
      steps: summary.steps.map((step) => ({
        label: `${step.step + 1} · ${step.type}`,
        outcome: step.outcome ?? '—',
        durationMs: step.durationMs
      })),
      notDiagnostic: NOT_DIAGNOSTIC,
      keys:
        'Press <span class="keycap">R</span> to replay this level · ' +
        '<span class="keycap">L</span> for the level list · ' +
        '<span class="keycap">J</span> downloads the JSON',
      onExport: exportSession,
      onReplay: () => startLevel(levelIndex),
      onLevels: () => showLevels(),
      onNext: next === null ? null : () => startLevel(next),
      nextLabel: next === null ? null : `Next: ${levels[next].title}`
    })
    overlayMode = 'summary'
  }

  /**
   * The level-selection screen. Reached at start-up, from the summary, and with `L`.
   *
   * It does not clear the event log. A finished attempt stays exportable while the
   * player looks at the list and decides — the log is only replaced when they actually
   * choose to play something, which is `startLevel`'s job.
   */
  const showLevels = (): void => {
    if (state.current === 'paused') state.resume()
    runner?.reset()
    stopSpeaking()
    voices.stop()
    interaction.clear()
    dropDwell()
    ui.hideAnswerCard()
    ui.hideInstruction()
    ui.setHint(null)
    ui.setControls(null)
    // Freezes movement and stops the clock while the list is up, and releases the
    // pointer deliberately so §5.1 does not read it as a pause.
    state.set('completed')
    player.releaseLock()

    ui.showLevelSelect({
      title: `Smriti — ${pack.patient.name}`,
      subtitle:
        `Three levels from the memory pack "${loaded.patientId}". ` +
        'Walk with W A S D, look with the mouse, press E to open doors and to look at things.',
      levels: levels.map((mission, index) => ({
        ordinal: `Level ${index + 1}`,
        title: mission.title,
        description: mission.description,
        shape: shapeOf(mission),
        finished: finished.has(mission.id),
        onStart: () => startLevel(index)
      })),
      // §2: shown only because the pack says it of itself.
      demoNotice: pack.demo?.notice ?? null,
      keys:
        '<span class="keycap">Esc</span> pauses · <span class="keycap">K</span> skips a step · ' +
        '<span class="keycap">R</span> replays · <span class="keycap">L</span> returns here'
    })
    overlayMode = 'levels'
  }

  // §5.1: an unlock we did not ask for is a pause.
  player.onUnexpectedUnlock = () => state.pause()

  state.onChange((next, previous) => {
    if (next === 'paused') {
      telemetry.pause()
      stopSpeaking()
      voices.stop()
      ui.showMessage('Paused', ['The clock is stopped.'], 'Click anywhere to resume')
      overlayMode = 'paused'
      return
    }
    if (previous === 'paused') telemetry.resume()
    // §5.1: resuming from a paused answer screen returns to `answering` with the card
    // visible and the pointer still unlocked, so the overlay has to clear for both.
    if (next === 'exploring' || next === 'answering') {
      ui.hideOverlay()
      overlayMode = 'none'
    }
  })

  // Degradations are not failures, but they should be visible without a console open.
  for (const problem of warnings) ui.log(`pack · ${problem.where} · ${problem.message}`)

  let currentRoom: string | null = null
  let started = false
  const feet = new THREE.Vector3()

  // §4.4: dwell, not frames — emitted only when the raycast target changes, and only
  // past 250 ms. Measured on the paused-time-removed clock.
  let dwellId: string | null = null
  let dwellSince = 0

  const flushDwell = (): void => {
    if (dwellId !== null) telemetry.objectDwell(dwellId, state.elapsed() - dwellSince)
    dropDwell()
  }

  /** Forget the open dwell without emitting it — §5.6 discards the old session. */
  const dropDwell = (): void => {
    dwellId = null
    dwellSince = 0
  }

  /**
   * Opens one attempt at one level. Replay, "next level" and `R` all come through here,
   * so the reset list below is the reset list for every one of them.
   *
   * §5.6 names what has to go: player position *and yaw*, room membership, highlights
   * and focus, step index, timers, hint levels, selected answers, pointer-lock state,
   * audio playback, and the telemetry event log. Switching levels needs all of it and
   * the level's own state as well, which is why the previous runner is disposed rather
   * than reused — its hint beacon is parented to the world and would otherwise stay.
   *
   * `spawnAt` exists only for the debug helper below; the game always spawns outside.
   */
  const startLevel = (index: number, spawnAt?: THREE.Vector3): void => {
    const mission = levels[index]
    if (!mission) {
      console.warn(`[smriti] no level at index ${index}`)
      return
    }
    // Unpause first, so `resume` lands before the boundary the log is cleared on.
    if (state.current === 'paused') state.resume()

    if (runner) {
      telemetry.restart()   // §5.6's hook; the recorder clears the log on it
      runner.dispose()      // step state, card, speech, pack audio, and the beacon
      runner = null
    }
    stopSpeaking()          // spoken instructions
    voices.stop()           // pack voice playback
    interaction.clear()     // focused object and its highlight
    dropDwell()
    player.clearInput()     // a key held down through a level switch must not carry over
    ui.clearLog()
    ui.hideAnswerCard()
    ui.setHint(null)
    ui.hideOverlay()

    levelIndex = index
    // Unique within the page-load, and readable: who, which level, which attempt.
    attemptId = `${loaded.patientId}-${mission.id}-a${recorder.attempts + 1}`
    // The log is emptied here, before a single event of the new attempt exists. Nothing
    // from the previous level or the previous try can reach this one's summary.
    recorder.beginAttempt(attemptId)

    player.teleport(spawnAt ?? world.spawn.position, world.spawn.yaw)  // position AND yaw

    // Room membership is recomputed from where the player now stands, not merely
    // cleared. A stale `currentRoom` of 'kitchen' is exactly what makes a later
    // re-entry produce no change event, and a navigate step then waits forever.
    currentRoom = world.roomOf(player.groundPoint(feet))

    state.resetTimers()     // every timer
    state.set('exploring')  // pointer-lock state follows from the state
    player.requestLock()
    overlayMode = 'none'
    started = true

    // An attempt that begins inside a room begins there, and no boundary will be
    // crossed to say so. Without this the export of exactly the session §5.5 exists for
    // — a restart taken in the kitchen — reports that the player visited no rooms at
    // all, which is false. The game's own spawn is outside, so `currentRoom` is normally
    // null here and nothing is emitted.
    if (currentRoom) telemetry.roomEnter(currentRoom)

    runner = new MissionRunner({
      pack, mission, world, player, state, telemetry, ui, media, voices,
      levelLabel: levelLabel(index)
    })
    runner.start()          // mission_start, then §5.5's containment test on step 1
  }

  const onClick = (): void => {
    // Browsers start an AudioContext suspended until a gesture. This is that gesture.
    voices.unlock()
    if (state.current === 'paused') {
      state.resume()
      if (state.pointerLockWanted) player.requestLock()
      return
    }
    // The level list and the summary are read, not clicked through: only their own
    // buttons act, and those stop the event before it reaches here.
    if (overlayMode !== 'none') return
    if (!player.isLocked && state.pointerLockWanted) player.requestLock()
  }
  document.addEventListener('click', onClick)

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      // While `exploring` the browser exits pointer lock and the pointerlockchange
      // handler pauses. In `answering` the pointer is *already* unlocked — no such
      // event will fire — so §5.1's "paused answer screen" is only reachable here.
      if (state.current === 'answering') state.pause()
      return
    }
    if (e.code === 'KeyR') {
      e.preventDefault()
      // Replays the selected level. Before anything has been selected it does nothing
      // rather than guessing which level was meant.
      if (levelIndex >= 0) startLevel(levelIndex)
      return
    }
    if (e.code === 'KeyL') {
      e.preventDefault()
      showLevels()
      return
    }
    if (e.code === 'KeyJ') {
      e.preventDefault()
      // Export is available at any moment, not only at the end: an attempt abandoned
      // half way is still an attempt, and §4.4's summary is defined on a partial log.
      exportSession()
      return
    }
    if (e.code === 'KeyK') {
      e.preventDefault()
      // §5.4: skip is always available — during a recall card as much as while walking.
      if (state.current === 'exploring' || state.current === 'answering') runner?.skip()
      return
    }
    if (e.code === 'KeyE' && state.current === 'exploring' && interaction.focus) {
      const id = interaction.focus.meta.id
      interaction.activate()          // doors open and close; the jug has no action
      runner?.notifyInteract(id)      // emits object_interact and may finish a find step
    }
  })

  // The first thing the player sees once the pack is in: which levels there are.
  showLevels()

  // Performance measurement (§7). renderer.info gives draw calls and triangles only;
  // frame time is sampled here over FRAME_SAMPLES frames once the world is up.
  const samples: number[] = []
  let warmup = 0
  let perf: PerfResult | null = null

  const clock = new THREE.Clock()
  let last = performance.now()

  const loop = (): void => {
    requestAnimationFrame(loop)
    const now = performance.now()
    const frameMs = now - last
    last = now

    const dt = Math.min(clock.getDelta(), 0.05)
    // Worlds with moving parts (doors) advance first, so collision and the raycast this
    // frame both see where the door actually is. Shadow maps are static otherwise.
    if (world.update?.(dt)) renderer.refreshShadows()
    player.update(dt)

    const room = world.roomOf(player.groundPoint(feet))
    if (room !== currentRoom) {
      currentRoom = room
      runner?.notifyRoom(room)
    }

    // Focus only exists while exploring; any other state drops it and its highlight.
    let focus = null as ReturnType<typeof interaction.update>
    if (state.current === 'exploring') focus = interaction.update(renderer.camera)
    else interaction.clear()

    const focusId = focus?.meta.id ?? null
    if (focusId !== dwellId) {
      flushDwell()
      if (focusId) {
        dwellId = focusId
        dwellSince = state.elapsed()
      }
    }

    ui.setPrompt(focus ? interaction.promptText() : null)
    runner?.update()
    ui.setControls(runner?.active ? CONTROLS_PLAYING : started ? CONTROLS_DONE : null)

    renderer.render()

    if (perf === null) {
      if (warmup < FRAME_WARMUP) {
        warmup++
      } else if (samples.length < FRAME_SAMPLES) {
        samples.push(frameMs)
      } else {
        const sorted = [...samples].sort((a, b) => a - b)
        const info = renderer.renderer.info
        perf = {
          medianMs: +percentile(sorted, 50).toFixed(2),
          p95Ms: +percentile(sorted, 95).toFixed(2),
          frames: sorted.length,
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          programs: info.programs?.length ?? 0,
          resolution: `${renderer.renderer.domElement.width}x${renderer.renderer.domElement.height}`,
          pixelRatio: renderer.renderer.getPixelRatio(),
          userAgent: navigator.userAgent
        }
        console.log('[smriti] perf', perf)
        ;(window as unknown as { __smritiPerf: PerfResult }).__smritiPerf = perf
      }
    }

    const info = renderer.renderer.info
    ui.setPerf(
      perf
        ? `draws ${info.render.calls}  tris ${info.render.triangles}\n` +
            `median ${perf.medianMs} ms  p95 ${perf.p95Ms} ms\n` +
            `${perf.resolution} @ dpr ${perf.pixelRatio}`
        : `draws ${info.render.calls}  tris ${info.render.triangles}\nmeasuring frame time… ${samples.length}/${FRAME_SAMPLES}`
    )

    const step = runner?.current ?? null
    ui.setHud(
      `pack <b>${loaded.patientId}</b> · ${pack.patient.name} · ` +
        `state <b>${state.current}</b> · room <b>${currentRoom ?? '—'}</b> · ` +
        `t <b>${(state.elapsed() / 1000).toFixed(1)}s</b>` +
        (levelIndex >= 0 ? ` · level <b>${levelIndex + 1}/${levels.length}</b>` : '') +
        (step && runner
          ? ` · step <b>${runner.stepIndex + 1}/${runner.steps.length} ${step.type}</b>` +
            ` · hint <b>${runner.level}</b>`
          : '') +
        (focus ? ` · focus <b>${focus.meta.id}</b>` : '')
    )
  }

  /**
   * Walks the floor around `id`, aims at it from each standable spot in turn, and runs
   * the real interaction pick. The first spot from which the object focuses wins, and
   * candidates are tried nearest-first, so `distance` is about as close as a player has
   * to get. Nothing here is simulated: it is `Interaction.update` with its own 2.5 m
   * limit and its own occlusion test, on the world that is actually on screen.
   */
  const probeFocus = (id: string): FocusProbe => {
    const target = world.interactables[id]
    if (!target) return { id, ok: false, reason: 'not an interactable in this world' }

    const bounds = new THREE.Box3().setFromObject(target)
    if (bounds.isEmpty()) return { id, ok: false, reason: 'the object has no geometry to aim at' }
    const centre = bounds.getCenter(new THREE.Vector3())

    // Put the player back afterwards — a probe must not move the game.
    const savedPosition = player.position.clone()
    const savedYaw = player.yaw
    const savedPitch = player.pitch
    const savedFocus = interaction.focus

    const candidates: THREE.Vector3[] = []
    const step = 0.2
    for (let ring = 1; ring <= 16; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue
          const x = centre.x + dx * step
          const z = centre.z + dz * step
          if (player.collidesAt(x, z)) continue
          // Standing on top of a prop puts the camera inside its geometry, where the
          // ray starts behind the front face and hits nothing. A player could not get
          // that close to something on a counter anyway.
          if (Math.hypot(x - centre.x, z - centre.z) < 0.45) continue
          candidates.push(new THREE.Vector3(x, 1.6, z))
        }
      }
    }
    candidates.sort(
      (a, b) => a.distanceToSquared(centre) - b.distanceToSquared(centre)
    )

    let result: FocusProbe = { id, ok: false, reason: 'no standable spot focuses it' }
    for (const spot of candidates) {
      player.teleport(spot, 0)
      player.aimAt(centre)
      // The raycast reads `camera.matrixWorld`, which three only recomputes during a
      // render. Without this the probe aims from wherever the camera stood last frame
      // and reports every target unreachable.
      renderer.camera.updateMatrixWorld(true)
      interaction.clear()
      const focus = interaction.update(renderer.camera)
      if (focus?.meta.id !== id) continue
      result = {
        id,
        ok: true,
        from: { x: +spot.x.toFixed(2), z: +spot.z.toFixed(2) },
        room: world.roomOf(player.groundPoint(new THREE.Vector3())),
        distance: +spot.distanceTo(centre).toFixed(2),
        prompt: interaction.promptText()
      }
      break
    }

    interaction.clear()
    player.teleport(savedPosition, savedYaw)
    player.pitch = savedPitch
    player.update(0)
    renderer.camera.updateMatrixWorld(true)
    if (savedFocus) interaction.update(renderer.camera)
    return result
  }

  /**
   * Debug handle — manual verification without needing pointer lock. Inspection only;
   * nothing in the game reads it.
   */
  ;(window as unknown as { __smriti: unknown }).__smriti = {
    world, player, interaction, state, renderer, ui, telemetry,
    pack, media, voices, warnings, patientId: loaded.patientId,
    recorder,
    get runner(): MissionRunner | null {
      return runner
    },
    get level(): number {
      return levelIndex
    },
    levels: levels.map((m) => m.id),
    summary: () => summarise(recorder.log),
    exportJson: () => buildExport(recorder.log, exportContext()),
    debug: {
      download: exportSession,
      showSummary,
      showLevels,
      startLevel,
      /** Replays whichever level is selected — what `R` and the Replay button do. */
      restart: () => startLevel(levelIndex),
      /** §6 Checkpoint C's "audible voice" — plays one person's voice on demand. */
      playVoice(personId: string): string {
        return voices.play(personId)
          ? `playing ${personId} from the audioSource anchor`
          : `no voice loaded for ${personId}`
      },
      /**
       * §5.5 / §6: "restarting inside the kitchen still completes step 1." The game
       * always spawns the player outside on the path, so this override is how the
       * containment branch itself is exercised: it starts the level with the player
       * standing in the named room, and a first navigate step must finish instantly.
       */
      restartInRoom(roomId: string, index = levelIndex): string {
        const trigger = world.triggers.find((t) => t.room === roomId)
        if (!trigger) return `no such room: ${roomId}`
        const spot = standableIn(trigger.box, player)
        if (!spot) return `no standable spot found in ${roomId}`
        startLevel(index, spot)
        return `started level ${index + 1} at ${spot.x.toFixed(2)}, ${spot.z.toFixed(2)} in ` +
          `${world.roomOf(player.groundPoint(new THREE.Vector3()))} — step is now ` +
          `${(runner?.stepIndex ?? -1) + 1}/${runner?.steps.length ?? 0}`
      },
      /**
       * Can a player actually stand somewhere and focus this object?
       *
       * "Ensure every target is reachable" is not something to eyeball. This walks the
       * standable floor near the target, aims the camera at it from each candidate spot,
       * and runs the real `Interaction.update` — the same 2.5 m limit and the same
       * ray-vs-Box3 occlusion test the game uses (§5.2). It reports the nearest spot
       * that works, or says that none does. The player is put back where they were.
       */
      canFocus(id: string): FocusProbe {
        return probeFocus(id)
      },
      /** Every interactable the three levels name, probed in one call. */
      probeTargets(): FocusProbe[] {
        const ids = new Set<string>()
        for (const mission of levels) {
          for (const step of mission.steps) if (step.type === 'find') ids.add(step.targetObject)
        }
        return [...ids].map((id) => probeFocus(id))
      }
    }
  }
  ;(window as unknown as { __smritiAssets: unknown }).__smritiAssets = { ...report, ...envReport }
  console.log('[smriti] assets', { ...report, ...envReport })

  requestAnimationFrame(loop)
}

/**
 * Keeps the house on screen behind a pack-rejection list. There is no player, no
 * mission and no telemetry in this loop — only the world and its doors — because the
 * point of the screen behind it is that the engine loaded and the pack did not.
 */
function renderOnly(renderer: Renderer, world: { update?: (dt: number) => boolean }): void {
  const clock = new THREE.Clock()
  const tick = (): void => {
    requestAnimationFrame(tick)
    if (world.update?.(Math.min(clock.getDelta(), 0.05))) renderer.refreshShadows()
    renderer.render()
  }
  requestAnimationFrame(tick)
}

/** Nearest non-colliding standing spot to a room's centre. Debug helper only. */
function standableIn(box: THREE.Box3, player: Player): THREE.Vector3 | null {
  const centre = box.getCenter(new THREE.Vector3())
  const step = 0.25
  for (let ring = 0; ring <= 24; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue
        const x = centre.x + dx * step
        const z = centre.z + dz * step
        if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue
        if (!player.collidesAt(x, z)) return new THREE.Vector3(x, 1.6, z)
      }
    }
  }
  return null
}

/** One short line per event for the on-screen log. Not a recording (§4.4 — that is D). */
function describe(event: Event): string {
  const t = `${(event.t / 1000).toFixed(1)}s`
  switch (event.kind) {
    case 'mission_start':
    case 'mission_complete':
      return `${t} · ${event.kind} · ${event.id}`
    case 'step_start':
      return `${t} · step_start · ${event.step + 1} ${event.type}`
    case 'step_end':
      return `${t} · step_end · ${event.step + 1} ${event.type} · ${event.outcome}`
    case 'room_enter':
      return `${t} · room_enter · ${event.room}`
    case 'object_dwell':
      return `${t} · object_dwell · ${event.id} · ${event.ms}ms`
    case 'object_interact':
      return `${t} · object_interact · ${event.id} · correct=${event.correct}`
    case 'question_shown':
      return `${t} · question_shown · step ${event.step + 1}`
    case 'answer_selected':
      return `${t} · answer_selected · ${event.choice} · correct=${event.correct}`
    case 'hint_shown':
      return `${t} · hint_shown · level ${event.level} · step ${event.step + 1}`
    default:
      return `${t} · ${event.kind}`
  }
}

// Referenced so the dwell threshold is visible next to its only call site in the console.
;(window as unknown as { __smritiDwellThresholdMs: number }).__smritiDwellThresholdMs =
  DWELL_THRESHOLD_MS

boot().catch((err) => {
  console.error(err)
  document.getElementById('app')!.innerHTML =
    `<pre style="color:#f88;padding:20px;font:13px ui-monospace,monospace">${String(err)}</pre>`
})
