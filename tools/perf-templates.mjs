/**
 * SPEC.md §7 / §11.5 — frame time per house template, on this machine's real GPU.
 *
 *     npm run build && node tools/perf-templates.mjs
 *
 * Serves the built `dist/` with `vite preview` and opens a **visible** Chrome window —
 * headless Chrome draws on SwiftShader, which §7 does not accept as the figure. For
 * every registered template × mirror it loads `/?template=<id>&mirror=<0|1>` and reports:
 *
 *   1. the game's own §7 sampler (`window.__memoriaPerf`): 300 requestAnimationFrame
 *      deltas, taken once the adaptive resolution has settled and any texture upgrade
 *      has finished, with the resolution, pixelRatio and browser they belong to. The
 *      player is where the game puts them: at spawn, on the path, facing the house.
 *   2. because a rAF figure pinned to the refresh interval is a v-sync reading and not a
 *      cost (§7), the render cost itself: the same renderer drawing the same scene 200
 *      times in a tight loop, each draw drained with `gl.finish()`. Measured twice —
 *      from spawn, and from the middle of the living room looking at `kitchenArch`, so
 *      the interior every level is played in is in view.
 *
 * The window must stay visible and unobstructed while it runs (about 30 s per
 * configuration): macOS throttles a hidden window's animation frames. The network is
 * left on, so the house wears the same textures a player gets; the report says which.
 *
 * Flags:
 *   --only=<id>   one template, both orientations
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 9224
const ORIGIN = 'http://localhost:4176'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)

if (!existsSync(join(REPO, 'dist', 'index.html'))) {
  console.error('dist/ is not built. Run `npm run build` first.')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function machine() {
  const sys = (key) => {
    try { return execFileSync('sysctl', ['-n', key], { encoding: 'utf8' }).trim() } catch { return '?' }
  }
  const os = (() => {
    try { return 'macOS ' + execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim() } catch { return process.platform }
  })()
  return `${sys('hw.model')} · ${cpus()[0]?.model ?? '?'} · ${Math.round(Number(sys('hw.memsize')) / 2 ** 30)} GB · ${os}`
}

const server = spawn(join(REPO, 'node_modules', '.bin', 'vite'), ['preview', '--port', new URL(ORIGIN).port, '--strictPort'],
  { cwd: REPO, stdio: 'ignore' })
for (let i = 0; i < 40; i++) {
  await sleep(250)
  try { await fetch(ORIGIN + '/', { signal: AbortSignal.timeout(800) }); break } catch { /* starting */ }
}

const profile = mkdtempSync(join(tmpdir(), 'memoria-perf-'))
const chrome = spawn(CHROME, [
  '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--window-size=1280,800', '--window-position=40,40',
  // Keep a backgrounded or occluded window drawing at full rate rather than throttled.
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' })

let ws
for (let i = 0; i < 60 && !ws; i++) {
  await sleep(250)
  try {
    const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')
    if (page?.webSocketDebuggerUrl) ws = new WebSocket(page.webSocketDebuggerUrl)
  } catch { /* not up yet */ }
}
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }) })
let nextId = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
const send = (method, params = {}) => new Promise((r) => {
  const id = ++nextId
  pending.set(id, r)
  ws.send(JSON.stringify({ id, method, params }))
})
async function evaluate(expression) {
  const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw')
  return result?.result?.value
}
await send('Page.bringToFront')

/** Runs in the page: draws the scene `n` times, each drained with gl.finish(). */
const TIGHT_LOOP = (n) => `(() => {
  const r = window.__memoria.renderer
  const gl = r.renderer.getContext()
  const t = []
  r.render(); gl.finish()
  for (let i = 0; i < ${n}; i++) {
    const s = performance.now()
    r.render(); gl.finish()
    t.push(performance.now() - s)
  }
  t.sort((a, b) => a - b)
  const at = (p) => t[Math.min(t.length - 1, Math.max(0, Math.ceil(p / 100 * t.length) - 1))]
  return { medianMs: +at(50).toFixed(2), p95Ms: +at(95).toFixed(2), draws: r.renderer.info.render.calls,
           triangles: r.renderer.info.render.triangles }
})()`

/** Runs in the page: stands the player mid living room, looking at kitchenArch. */
const LIVING_ROOM_VIEW = `(() => {
  const { world, player, renderer } = window.__memoria
  const room = world.triggers.find((t) => t.room === 'livingRoom').box
  const arch = world.hintTargets.kitchenArch
  const centre = room.getCenter(new player.position.constructor())
  const target = new arch.position.constructor()
  new room.constructor().setFromObject(arch).getCenter(target)
  // The nearest spot to the room's centre the player can actually stand on.
  let best = null
  for (let r = 0; r <= 3 && !best; r += 0.25) {
    for (let a = 0; a < 16 && !best; a++) {
      const x = centre.x + r * Math.cos(a * Math.PI / 8), z = centre.z + r * Math.sin(a * Math.PI / 8)
      if (!player.collidesAt(x, z) && world.roomOf(centre.clone().set(x, 1, z)) === 'livingRoom') best = [x, z]
    }
  }
  player.teleport(centre.clone().set(best[0], 1.6, best[1]), 0)
  player.aimAt(target.setY(1.2))
  player.update(0)
  renderer.camera.updateMatrixWorld(true)
  return { x: +best[0].toFixed(2), z: +best[1].toFixed(2), room: world.roomOf(centre.clone().set(best[0], 1, best[1])) }
})()`

const rows = []
try {
  await send('Page.navigate', { url: ORIGIN + '/' })
  let ids = null
  for (let i = 0; i < 120 && !ids; i++) { await sleep(250); ids = await evaluate('window.__memoriaTemplates ?? null').catch(() => null) }
  const configs = ids.filter((id) => !ONLY || id === ONLY).flatMap((id) => [false, true].map((mirror) => ({ id, mirror })))

  for (const { id, mirror } of configs) {
    const name = `${id}${mirror ? ' · mirrored' : ''}`
    await evaluate('delete window.__memoria; delete window.__memoriaPerf').catch(() => {})
    await send('Page.navigate', { url: `${ORIGIN}/?template=${id}&mirror=${mirror ? 1 : 0}` })
    let perf = null
    for (let i = 0; i < 480 && !perf; i++) {
      await sleep(250)
      perf = await evaluate('window.__memoriaPerf ?? null').catch(() => null)
    }
    if (!perf) { rows.push({ name, error: 'the §7 sampler never completed' }); console.log(`${name}: sampler never completed`); continue }
    const house = await evaluate('JSON.stringify(window.__memoriaAssets.template)')
    const textures = await evaluate('window.__memoriaAssets.texturesFailed.length === 0 ? "all textures loaded" : "failed: " + window.__memoriaAssets.texturesFailed.join(",")')
    const renderer = await evaluate('window.__memoriaAssets.quality?.reason ?? "?"')
    const spawnCost = await evaluate(TIGHT_LOOP(200))
    const where = await evaluate(LIVING_ROOM_VIEW)
    const livingCost = await evaluate(TIGHT_LOOP(200))
    const row = { name, house: JSON.parse(house), perf, spawnCost, where, livingCost, textures, renderer }
    rows.push(row)
    console.log(`\n${name}  (${textures})`)
    console.log(`  rAF sampler, spawn view: median ${perf.medianMs} ms · p95 ${perf.p95Ms} ms · ${perf.frames} frames · ` +
      `${perf.resolution} @ pixelRatio ${perf.pixelRatio} · ${perf.drawCalls} draws · ${perf.triangles} tris · ${perf.textureResolution} textures`)
    console.log(`  render cost (gl.finish), spawn view:       median ${spawnCost.medianMs} ms · p95 ${spawnCost.p95Ms} ms · ${spawnCost.draws} draws`)
    console.log(`  render cost (gl.finish), living room (${where.x}, ${where.z}): median ${livingCost.medianMs} ms · p95 ${livingCost.p95Ms} ms · ${livingCost.draws} draws`)
  }
  console.log(`\nbrowser:  ${rows.find((r) => r.perf)?.perf.userAgent}`)
  console.log(`GPU:      ${rows.find((r) => r.renderer)?.renderer}`)
  console.log(`machine:  ${machine()}`)
} finally {
  ws.close()
  // Chrome keeps writing its profile until it has actually exited.
  const exited = new Promise((r) => chrome.once('exit', r))
  chrome.kill()
  server.kill()
  await Promise.race([exited, sleep(5000)])
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
