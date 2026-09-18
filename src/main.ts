import * as THREE from 'three'
import { Interaction } from './Interaction'
import { Player } from './Player'
import { Renderer } from './Renderer'
import { State } from './State'
import { UI } from './ui'
import { assertWorldContract } from './World'
import { createProceduralHouse } from './proceduralHouse'

/**
 * SPEC.md §3 — entry and game loop. Checkpoint A only: scaffold, renderer, procedural
 * world, movement, one interaction, deploy. No mission runner, no packs, no telemetry
 * recording — those are Checkpoints B–D.
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

async function boot(): Promise<void> {
  const app = document.getElementById('app')!
  const ui = new UI(app)
  ui.showLoading('Preparing the house…')

  const renderer = new Renderer(app)
  const state = new State()

  // Both downloads are optional by contract (§1.1); neither can fail the boot.
  const [{ world, report }, envReport] = await Promise.all([
    createProceduralHouse(),
    renderer.setupEnvironment()
  ])
  assertWorldContract(world)
  renderer.scene.add(world.root)

  const player = new Player(renderer.camera, renderer.renderer.domElement, state, world.blockers)
  player.teleport(world.spawn.position, world.spawn.yaw)

  const interaction = new Interaction(world)

  // §5.1: an unlock we did not ask for is a pause.
  player.onUnexpectedUnlock = () => state.pause()

  state.onChange((next) => {
    if (next === 'paused') {
      ui.showMessage('Paused', ['The clock is stopped.'], 'Click anywhere to resume')
    } else if (next === 'exploring') {
      ui.hideOverlay()
    }
  })

  const startMessages = [
    'Walk with <b>W A S D</b>, look with the mouse.',
    'Go through the doorway to the kitchen and look at the water jug.'
  ]
  ui.showMessage(
    'Smriti — Checkpoint A',
    startMessages,
    'Click to start · Esc pauses · E interacts'
  )

  const resume = (): void => {
    if (state.current === 'paused') {
      state.resume()
      if (state.pointerLockWanted) player.requestLock()
    } else if (!player.isLocked && state.pointerLockWanted) {
      ui.hideOverlay()
      player.requestLock()
    }
  }
  document.addEventListener('click', resume)

  let currentRoom: string | null = null
  const feet = new THREE.Vector3()

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && state.current === 'exploring' && interaction.focus) {
      // Checkpoint A's interaction: log an event. The mission runner consumes this in B.
      const event = {
        t: Math.round(state.elapsed()),
        kind: 'object_interact' as const,
        id: interaction.focus.id,
        correct: true
      }
      console.log('[smriti] interact', event)
      ui.log(`interact · ${event.id} · t=${(event.t / 1000).toFixed(1)}s`)
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
    player.update(dt)

    const room = world.roomOf(player.groundPoint(feet))
    if (room !== currentRoom) {
      currentRoom = room
      if (room) {
        console.log('[smriti] room_enter', { t: Math.round(state.elapsed()), kind: 'room_enter', room })
        ui.log(`room_enter · ${room}`)
      }
    }

    // Focus only exists while exploring; any other state drops it and its highlight.
    let focus = null as ReturnType<typeof interaction.update>
    if (state.current === 'exploring') focus = interaction.update(renderer.camera)
    else interaction.clear()
    ui.setPrompt(focus ? interaction.promptText() : null)

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

    ui.setHud(
      `state <b>${state.current}</b> · room <b>${currentRoom ?? '—'}</b> · ` +
        `t <b>${(state.elapsed() / 1000).toFixed(1)}s</b>` +
        (focus ? ` · focus <b>${focus.id}</b>` : '')
    )
  }

  // Debug handle — manual verification of collision, occlusion and room containment
  // without needing pointer lock. Inspection only; nothing in the game reads it.
  ;(window as unknown as { __smriti: unknown }).__smriti = {
    world, player, interaction, state, renderer, ui
  }
  ;(window as unknown as { __smritiAssets: unknown }).__smritiAssets = { ...report, ...envReport }
  console.log('[smriti] assets', { ...report, ...envReport })

  requestAnimationFrame(loop)
}

boot().catch((err) => {
  console.error(err)
  document.getElementById('app')!.innerHTML =
    `<pre style="color:#f88;padding:20px;font:13px ui-monospace,monospace">${String(err)}</pre>`
})
