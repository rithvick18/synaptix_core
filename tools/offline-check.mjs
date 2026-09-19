/**
 * SPEC.md §1.1 / §6 Checkpoint D — the offline check, performed rather than asserted.
 *
 *     npm run build && npm run check:offline
 *
 * Serves the built `dist/` with the vendored static server (`vite preview`), then
 * launches headless Chrome with **every DNS name except localhost mapped to NOTFOUND**,
 * so the page genuinely cannot reach the network — not a throttle, not an "offline"
 * emulation flag the page could detect and humour. It then records every request the
 * page makes, plays the mission through to its summary, and builds the JSON export.
 *
 * The two things it proves, which a screenshot cannot:
 *   1. every same-origin asset resolved, and
 *   2. no remote request succeeded — each one failed and each one was optional (§1.1).
 *
 * Node's global WebSocket speaks the DevTools protocol directly, so this needs no
 * dependency beyond what the project already installs. Requires Node 22+ and Chrome.
 *
 * Flags:
 *   --online   run the same checks with the network available, for comparison
 *   --perf     also wait for §7's 300-frame sample (~1 min: headless is SwiftShader,
 *              and the figure it yields is NOT the demo machine's)
 *   --origin=  point at an already-running server instead of starting one
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const originArg = process.argv.find((a) => a.startsWith('--origin='))
const ORIGIN = originArg ? originArg.slice('--origin='.length) : 'http://localhost:4173'
const OFFLINE = !process.argv.includes('--online')
const PERF = process.argv.includes('--perf')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9222

if (!existsSync(join(REPO, 'dist', 'index.html'))) {
  console.error('dist/ is not built. Run `npm run build` first.')
  process.exit(1)
}
if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Set CHROME=/path/to/chrome and re-run.`)
  process.exit(1)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Starts the vendored static server unless something is already answering on ORIGIN. */
async function startServerIfNeeded() {
  try {
    await fetch(ORIGIN + '/', { signal: AbortSignal.timeout(800) })
    console.log(`  using the server already running on ${ORIGIN}`)
    return null
  } catch {
    /* nothing there — start our own */
  }
  const port = new URL(ORIGIN).port || '4173'
  const server = spawn(
    join(REPO, 'node_modules', '.bin', 'vite'),
    ['preview', '--port', port, '--strictPort'],
    { cwd: REPO, stdio: ['ignore', 'ignore', 'ignore'] }
  )
  for (let i = 0; i < 40; i++) {
    await wait(250)
    try {
      await fetch(ORIGIN + '/', { signal: AbortSignal.timeout(800) })
      console.log(`  started vite preview on ${ORIGIN}`)
      return server
    } catch {
      /* still starting */
    }
  }
  server.kill()
  throw new Error(`vite preview never answered on ${ORIGIN}`)
}

const server = await startServerIfNeeded()

const profile = mkdtempSync(join(tmpdir(), 'smriti-cdp-'))
const args = [
  '--headless',
  '--disable-gpu',
  '--enable-unsafe-swiftshader',
  '--no-first-run',
  '--no-default-browser-check',
  '--mute-audio',
  '--window-size=1280,800',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank'
]
// The whole point: nothing but localhost resolves. Not a throttle, not an offline
// emulation flag the page could be unaware of — DNS simply fails.
if (OFFLINE) args.push('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost')

const chrome = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] })
const sleep = wait

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('Chrome did not expose a debugging target')
}

class CDP {
  #id = 0
  #pending = new Map()
  handlers = new Map()

  constructor(ws) {
    this.ws = ws
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== undefined) {
        const entry = this.#pending.get(msg.id)
        this.#pending.delete(msg.id)
        if (!entry) return
        if (msg.error) entry.reject(new Error(`${msg.error.message} (${entry.method})`))
        else entry.resolve(msg.result)
        return
      }
      this.handlers.get(msg.method)?.forEach((fn) => fn(msg.params))
    })
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    return new CDP(ws)
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(fn)
  }

  send(method, params = {}) {
    const id = ++this.#id
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression, awaitPromise = false) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw')
    }
    return result.result.value
  }
}

// ---------------------------------------------------------------------------

const requests = new Map() // requestId -> { url, status, failed, fromCache }
const consoleErrors = []
const pageErrors = []
let checks = 0
const failures = []
const ok = (condition, label, detail = '') => {
  checks++
  if (!condition) failures.push(label + (detail ? `\n     ${detail}` : ''))
}

try {
  const cdp = await CDP.connect(await targetUrl())

  cdp.on('Network.requestWillBeSent', (p) => {
    requests.set(p.requestId, { url: p.request.url, status: null, failed: null, type: p.type })
  })
  cdp.on('Network.responseReceived', (p) => {
    const entry = requests.get(p.requestId)
    if (entry) {
      entry.status = p.response.status
      entry.fromCache = p.response.fromDiskCache
      entry.mime = p.response.mimeType
    }
  })
  cdp.on('Network.loadingFailed', (p) => {
    const entry = requests.get(p.requestId)
    if (entry) entry.failed = p.errorText
  })
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') {
      consoleErrors.push(p.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })
  cdp.on('Runtime.exceptionThrown', (p) => {
    pageErrors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text)
  })

  await cdp.send('Network.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  await cdp.send('Page.navigate', { url: ORIGIN + '/' })

  // Wait for boot: the debug handle only exists once the pack has loaded and the loop
  // has been scheduled, so its presence is the real "the app is up" signal.
  let booted = false
  for (let i = 0; i < 120; i++) {
    await sleep(250)
    booted = await cdp.eval('typeof window.__smriti === "object" && !!window.__smriti?.missions')
    if (booted) break
  }
  ok(booted, 'the app boots with the network disabled', 'window.__smriti.missions never appeared')

  if (booted) {
    // --- the world actually built ------------------------------------------
    const assets = await cdp.eval('JSON.stringify(window.__smritiAssets)')
    const parsedAssets = JSON.parse(assets)
    console.log('  assets report:', JSON.stringify({
      hdri: parsedAssets.hdri,
      texturesLoaded: parsedAssets.texturesLoaded,
      texturesFailed: parsedAssets.texturesFailed
    }))
    ok(
      parsedAssets.hdri === 'failed' || !OFFLINE,
      '§1.1 the HDRI download fails offline and the scene falls back'
    )
    ok(
      parsedAssets.texturesFailed.length === 4 || !OFFLINE,
      '§1.1 every Poly Haven texture set falls back offline',
      `failed: ${parsedAssets.texturesFailed.join(', ')}`
    )
    const doorways = await cdp.eval(
      'JSON.stringify(window.__smritiAssets.doorways.filter(d => !d.ok))'
    )
    ok(doorways === '[]', '§1.1 every doorway is still passable with no textures', doorways)

    // --- the pack loaded from the local server ------------------------------
    const patient = await cdp.eval('window.__smriti.pack.patient.name')
    ok(patient === 'Mira', 'the memory pack loaded offline', `patient = ${patient}`)
    const photos = await cdp.eval(
      'window.__smriti.pack.people.every(p => !!window.__smriti.media.photoFor(p.id))'
    )
    ok(photos === true, 'every pack photograph decoded offline')
    const voices = await cdp.eval(
      'window.__smriti.pack.people.every(p => !!window.__smriti.media.voiceFor(p.id))'
    )
    ok(voices === true, 'every pack voice decoded offline')
    const warnings = await cdp.eval('JSON.stringify(window.__smriti.warnings)')
    ok(warnings === '[]', 'no pack degradations offline', warnings)

    // --- §7 frame time ------------------------------------------------------
    //
    // Opt-in with --perf, because headless Chrome runs this scene on SwiftShader at
    // roughly 5 fps and 330 frames therefore take about a minute. The number it yields
    // is a genuine measurement of a *software rasteriser*, not of the demo machine's
    // GPU, so it is printed with that caveat and never used as the §7 figure.
    if (PERF) {
      let perf = null
      for (let i = 0; i < 480; i++) {
        perf = await cdp.eval('window.__smritiPerf ? JSON.stringify(window.__smritiPerf) : null')
        if (perf) break
        await sleep(250)
      }
      ok(perf !== null, '§7 the frame-time sampler completes 300 frames')
      if (perf) console.log('  §7 sampler (headless SwiftShader — NOT the demo machine):', perf)
    } else {
      const readout = await cdp.eval('document.querySelector("#perf")?.textContent ?? ""')
      console.log('  §7 sampler not run (pass --perf); readout:', readout.replace(/\n/g, ' | '))
    }

    // --- play the mission ---------------------------------------------------
    await cdp.eval('document.body.click()')
    await sleep(300)
    // Restart into the kitchen so step 1 completes by §5.5 containment.
    const restarted = await cdp.eval('window.__smriti.debug.restartInRoom("kitchen")')
    console.log('  restartInRoom:', restarted)
    await sleep(500)
    ok(
      (await cdp.eval('window.__smriti.missions.stepIndex')) === 1,
      '§5.5 restarting in the kitchen completes step 1'
    )

    await cdp.eval('window.__smriti.missions.notifyInteract("water-jug")')
    await sleep(200)
    ok(
      (await cdp.eval('window.__smriti.missions.stepIndex')) === 2,
      'the find step completes on interact'
    )

    // The answer card is real DOM; click it the way a person would.
    const cardIsPhoto = await cdp.eval(
      'document.querySelectorAll("#answer button.choice.photo").length'
    )
    ok(cardIsPhoto === 3, 'all three choices render as photo cards offline', `got ${cardIsPhoto}`)
    await cdp.eval('document.querySelector(\'#answer button.choice[data-id="ananya"]\').click()')
    await sleep(400)

    // --- §4.4 summary on screen --------------------------------------------
    const summaryText = await cdp.eval('document.querySelector("#overlay .card")?.textContent ?? ""')
    ok(
      summaryText.includes('auxiliary interaction measures — not diagnostic'),
      '§4.4 the not-diagnostic label is on screen',
      summaryText.slice(0, 120)
    )
    for (const word of ['independent', 'cued', 'revealed', 'skipped']) {
      ok(summaryText.includes(word), `§4.3 the summary shows "${word}" separately`)
    }
    ok(summaryText.includes('answer latency'), '§4.4 answer latency is on the summary')
    ok(summaryText.includes('time to reveal'), '§4.4 time to reveal is its own row')

    const summary = JSON.parse(await cdp.eval('JSON.stringify(window.__smriti.summary())'))
    console.log('  summary:', JSON.stringify(summary.outcomes), 'completion', summary.completionTimeMs)
    ok(summary.completed === true, 'the mission completed offline')
    ok(summary.outcomes.independent === 3, '§4.3 three independent steps', JSON.stringify(summary.outcomes))
    ok(Object.keys(summary.outcomes).length === 4, '§4.3 four outcome counts')
    ok(summary.steps[2].answerLatencyMs !== null, '§4.4 answerLatency present on an answered step')
    ok(summary.steps[2].timeToRevealMs === null, '§4.4 timeToReveal null with no reveal')

    const doc = JSON.parse(await cdp.eval('JSON.stringify(window.__smriti.exportJson())'))
    ok(doc.format === 'smriti-telemetry', 'the JSON export builds offline')
    ok(doc.events.length > 5, 'the export carries the recorded log', `${doc.events.length} events`)
    ok(doc.notDiagnostic.includes('not diagnostic'), '§4.4 the export carries the label')
  }

  // --- request audit --------------------------------------------------------
  const all = [...requests.values()].filter((r) => !r.url.startsWith('data:'))
  const local = all.filter((r) => r.url.startsWith(ORIGIN))
  const remote = all.filter((r) => !r.url.startsWith(ORIGIN))
  const localFailed = local.filter((r) => r.failed || (r.status !== null && r.status >= 400))
  const remoteSucceeded = remote.filter((r) => r.status !== null && r.status < 400)

  console.log(`\n  requests: ${all.length} total · ${local.length} same-origin · ${remote.length} remote`)
  for (const r of remote) {
    console.log(`    remote  ${r.failed ? 'BLOCKED' : `status ${r.status}`}  ${r.url.slice(0, 95)}`)
  }
  for (const r of localFailed) {
    console.log(`    local   FAILED ${r.failed ?? r.status}  ${r.url}`)
  }

  ok(local.length > 0, 'the page made same-origin requests')
  ok(localFailed.length === 0, 'every same-origin asset resolved locally', localFailed.map((r) => r.url).join('\n     '))
  if (OFFLINE) {
    ok(remoteSucceeded.length === 0, 'no remote request succeeded with the network disabled',
       remoteSucceeded.map((r) => r.url).join('\n     '))
  }
  ok(pageErrors.length === 0, 'no uncaught exceptions', pageErrors.join('\n     '))

  const unexpectedConsole = consoleErrors.filter(
    (m) => !/hdri|texture|polyhaven|Failed to load resource|ERR_NAME_NOT_RESOLVED/i.test(m)
  )
  ok(
    unexpectedConsole.length === 0,
    'no console errors beyond the expected optional-asset failures',
    unexpectedConsole.join('\n     ')
  )

  console.log(`\n  local asset inventory (${local.length}):`)
  for (const r of local.sort((a, b) => a.url.localeCompare(b.url))) {
    console.log(`    ${String(r.status).padStart(3)}  ${r.type.padEnd(8)}  ${r.url.replace(ORIGIN, '')}`)
  }
} finally {
  chrome.kill()
  server?.kill()
  rmSync(profile, { recursive: true, force: true })
}

console.log('')
if (failures.length === 0) {
  console.log(`OFFLINE CHECK PASSED (${checks} assertions, network ${OFFLINE ? 'DISABLED' : 'enabled'})`)
} else {
  console.log(`${failures.length} of ${checks} assertions FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
