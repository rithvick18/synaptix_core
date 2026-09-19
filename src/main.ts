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
import { MissionRunner, stopSpeaking } from './Missions'
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

const CONTROLS_PLAYING =
  '<span class="keycap">W A S D</span> walk · <span class="keycap">E</span> interact · ' +
  '<span class="keycap">K</span> skip this step · <span class="keycap">R</span> start again · ' +
  '<span class="keycap">J</span> export JSON · <span class="keycap">Esc</span> pause'
const CONTROLS_DONE =
  '<span class="keycap">R</span> start again · <span class="keycap">J</span> export JSON'

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
    if (event.kind === 'mission_complete') showSummary()
  }

  const mission = pack.missions[0]
  const missions = new MissionRunner({
    pack, mission, world, player, state, telemetry, ui, media, voices
  })

  // --- §4.4 summary and export ---------------------------------------------------

  const seconds = (value: number | null): string =>
    value === null ? '—' : `${(value / 1000).toFixed(1)}s`

  const exportSession = (): string => {
    const doc = buildExport(recorder.log, {
      patientId: loaded.patientId,
      patientName: pack.patient.name,
      missionTitle: mission.title,
      restarts: recorder.restarts
    })
    const name = exportFilename(loaded.patientId)
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

    ui.showSummary({
      title: mission.title,
      subtitle:
        `${pack.patient.name} · ` +
        (summary.completed ? 'mission finished' : 'session so far') +
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
          note: summary.roomsVisited.join(', ') || null
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
        'Press <span class="keycap">R</span> to start again · ' +
        '<span class="keycap">J</span> downloads the JSON',
      onExport: exportSession,
      onRestart: () => restart()
    })
  }

  // §5.1: an unlock we did not ask for is a pause.
  player.onUnexpectedUnlock = () => state.pause()

  state.onChange((next, previous) => {
    if (next === 'paused') {
      telemetry.pause()
      stopSpeaking()
      voices.stop()
      ui.showMessage('Paused', ['The clock is stopped.'], 'Click anywhere to resume')
      return
    }
    if (previous === 'paused') telemetry.resume()
    // §5.1: resuming from a paused answer screen returns to `answering` with the card
    // visible and the pointer still unlocked, so the overlay has to clear for both.
    if (next === 'exploring' || next === 'answering') ui.hideOverlay()
  })

  ui.showMessage(`Smriti — ${pack.patient.name}`, [
    mission.title,
    'Walk with <b>W A S D</b>, look with the mouse, press <b>E</b> to open doors and interact.',
    'The front door is ahead of you.'
  ], 'Click to start · Esc pauses · K skips a step · R starts again')

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
   * §5.6 — restart. `spawnAt` exists only for the debug helper below; the game itself
   * always restarts to `world.spawn`.
   */
  const restart = (spawnAt?: THREE.Vector3): void => {
    // Unpause first, so `resume` lands before `restart` rather than after the boundary
    // that Checkpoint D clears the log on.
    if (state.current === 'paused') state.resume()

    telemetry.restart()      // Checkpoint D clears the event log on this hook.
    missions.reset()         // step index, hint levels, card, selected answers, speech
    stopSpeaking()           // spoken instructions
    voices.stop()            // pack voice playback
    interaction.clear()      // focused object and its highlight
    dropDwell()
    ui.clearLog()
    ui.hideAnswerCard()
    ui.hideOverlay()

    player.teleport(spawnAt ?? world.spawn.position, world.spawn.yaw)  // position AND yaw

    // Room membership is recomputed from where the player now stands, not merely
    // cleared. A stale `currentRoom` of 'kitchen' is exactly what makes a later
    // re-entry produce no change event, and a navigate step then waits forever.
    currentRoom = world.roomOf(player.groundPoint(feet))

    state.resetTimers()      // every timer
    state.set('exploring')   // pointer-lock state follows from the state
    player.requestLock()

    // A restart that lands the player inside a room starts the session already there,
    // and no boundary will be crossed to say so. Without this the export of exactly the
    // session §5.5 exists for — a restart taken in the kitchen — reports that the player
    // visited no rooms at all, which is false. The game's own restart spawns outside, so
    // `currentRoom` is normally null here and nothing is emitted.
    if (currentRoom) telemetry.roomEnter(currentRoom)

    started = true
    missions.start()         // mission_start, then §5.5's containment test on step 1
  }

  const resume = (): void => {
    // Browsers start an AudioContext suspended until a gesture. This is that gesture.
    voices.unlock()
    if (state.current === 'paused') {
      state.resume()
      if (state.pointerLockWanted) player.requestLock()
      return
    }
    if (!started) {
      started = true
      ui.hideOverlay()
      player.requestLock()
      state.resetTimers()
      missions.start()
      return
    }
    if (!player.isLocked && state.pointerLockWanted) {
      ui.hideOverlay()
      player.requestLock()
    }
  }
  document.addEventListener('click', resume)

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
      restart()
      return
    }
    if (e.code === 'KeyJ') {
      e.preventDefault()
      // Export is available at any moment, not only at the end: a session abandoned
      // half way is still a session, and §4.4's summary is defined on a partial log.
      exportSession()
      return
    }
    if (e.code === 'KeyK') {
      e.preventDefault()
      // §5.4: skip is always available — during a recall card as much as while walking.
      if (state.current === 'exploring' || state.current === 'answering') missions.skip()
      return
    }
    if (e.code === 'KeyE' && state.current === 'exploring' && interaction.focus) {
      const id = interaction.focus.meta.id
      interaction.activate()          // doors open and close; the jug has no action
      missions.notifyInteract(id)     // emits object_interact and may finish a find step
    }
  })

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
      missions.notifyRoom(room)
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
    missions.update()
    ui.setControls(missions.active ? CONTROLS_PLAYING : started ? CONTROLS_DONE : null)

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

    const step = missions.current
    ui.setHud(
      `pack <b>${loaded.patientId}</b> · ${pack.patient.name} · ` +
        `state <b>${state.current}</b> · room <b>${currentRoom ?? '—'}</b> · ` +
        `t <b>${(state.elapsed() / 1000).toFixed(1)}s</b>` +
        (step ? ` · step <b>${missions.stepIndex + 1}/${missions.steps.length} ${step.type}</b>` +
          ` · hint <b>${missions.level}</b>` : '') +
        (focus ? ` · focus <b>${focus.meta.id}</b>` : '')
    )
  }

  /**
   * Debug handle — manual verification without needing pointer lock. Inspection only;
   * nothing in the game reads it.
   */
  ;(window as unknown as { __smriti: unknown }).__smriti = {
    world, player, interaction, state, renderer, ui, missions, telemetry,
    pack, media, voices, warnings, patientId: loaded.patientId,
    recorder,
    summary: () => summarise(recorder.log),
    exportJson: () =>
      buildExport(recorder.log, {
        patientId: loaded.patientId,
        patientName: pack.patient.name,
        missionTitle: mission.title,
        restarts: recorder.restarts
      }),
    debug: {
      download: exportSession,
      showSummary,
      restart,
      /**
       * §5.5 / §6: "restarting inside the kitchen still completes step 1." The game
       * always restarts the player to `world.spawn`, which is outside on the path, so
       * this override is how the containment branch itself is exercised: it restarts
       * with the player standing in the named room, and step 1 must finish instantly.
       */
      /** §6 Checkpoint C's "audible voice" — plays one person's voice on demand. */
      playVoice(personId: string): string {
        return voices.play(personId)
          ? `playing ${personId} from the audioSource anchor`
          : `no voice loaded for ${personId}`
      },
      restartInRoom(roomId: string): string {
        const trigger = world.triggers.find((t) => t.room === roomId)
        if (!trigger) return `no such room: ${roomId}`
        const spot = standableIn(trigger.box, player)
        if (!spot) return `no standable spot found in ${roomId}`
        restart(spot)
        return `restarted at ${spot.x.toFixed(2)}, ${spot.z.toFixed(2)} in ` +
          `${world.roomOf(player.groundPoint(new THREE.Vector3()))} — step is now ` +
          `${missions.stepIndex + 1}/${missions.steps.length}`
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
