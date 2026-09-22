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

const profile = mkdtempSync(join(tmpdir(), 'memoria-cdp-'))
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
    booted = await cdp.eval('typeof window.__memoria === "object" && !!window.__memoria?.debug')
    if (booted) break
  }
  ok(booted, 'the app boots with the network disabled', 'window.__memoria.debug never appeared')

  if (booted) {
    // --- the world actually built ------------------------------------------
    const assets = await cdp.eval('JSON.stringify(window.__memoriaAssets)')
    const parsedAssets = JSON.parse(assets)
    console.log('  assets report:', JSON.stringify({
      hdri: parsedAssets.hdri,
      texturesLoaded: parsedAssets.texturesLoaded,
      texturesFailed: parsedAssets.texturesFailed
    }))

    // --- §1.1/§7 the resolution policy -------------------------------------
    //
    // Headless Chrome draws on SwiftShader, so this run must land in the software tier
    // and keep every setting this project had before the adaptive resolution existed.
    // That is what lets the §7 figure below stay comparable with every earlier run:
    // a number measured at a different pixel ratio is a different number.
    console.log('  quality:', JSON.stringify(parsedAssets.quality))
    ok(
      parsedAssets.quality?.tier === 'software',
      'the software rasteriser is recognised as one',
      `tier = ${parsedAssets.quality?.tier} · renderer = ${parsedAssets.quality?.reason}`
    )
    ok(parsedAssets.quality?.maxPixelRatio === 1, 'the pixel ratio is left at 1 on a software rasteriser')
    ok(parsedAssets.quality?.upgradeResolution === null, 'no 2k upgrade is attempted on a software rasteriser')
    ok(parsedAssets.textureResolution === '1k', 'the house is wearing the 1k maps it booted with')
    ok(
      (await cdp.eval('window.__memoria.renderer.renderer.getPixelRatio()')) === 1,
      'the renderer is actually drawing at dpr 1'
    )
    ok(
      [...requests.values()].every((r) => !/\/jpg\/2k\//.test(r.url)),
      'no 2k texture was requested',
      [...requests.values()].filter((r) => /2k/.test(r.url)).map((r) => r.url).join(', ')
    )
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
      'JSON.stringify(window.__memoriaAssets.doorways.filter(d => !d.ok))'
    )
    ok(doorways === '[]', '§1.1 every doorway is still passable with no textures', doorways)

    // --- the pack loaded from the local server ------------------------------
    const patient = await cdp.eval('window.__memoria.pack.patient.name')
    ok(patient === 'Mira', 'the memory pack loaded offline', `patient = ${patient}`)
    const photos = await cdp.eval(
      'window.__memoria.pack.people.every(p => !!window.__memoria.media.photoFor(p.id))'
    )
    ok(photos === true, 'every pack photograph decoded offline')
    const voices = await cdp.eval(
      'window.__memoria.pack.people.every(p => !!window.__memoria.media.voiceFor(p.id))'
    )
    ok(voices === true, 'every pack voice decoded offline')
    const warnings = await cdp.eval('JSON.stringify(window.__memoria.warnings)')
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
        perf = await cdp.eval('window.__memoriaPerf ? JSON.stringify(window.__memoriaPerf) : null')
        if (perf) break
        await sleep(250)
      }
      ok(perf !== null, '§7 the frame-time sampler completes 300 frames')
      if (perf) console.log('  §7 sampler (headless SwiftShader — NOT the demo machine):', perf)
    } else {
      const readout = await cdp.eval('document.querySelector("#perf")?.textContent ?? ""')
      console.log('  §7 sampler not run (pass --perf); readout:', readout.replace(/\n/g, ' | '))
    }

    // --- every level's targets are reachable --------------------------------
    //
    // "Ensure every target is reachable" is not something to take on trust. This runs
    // the game's own probe: it walks the standable floor around each target, aims at it
    // and runs the real `Interaction.update` — the same 2.5 m limit and the same
    // ray-vs-Box3 occlusion test a player's crosshair goes through (§5.2).
    const probes = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.debug.probeTargets())'))
    console.log('\n  reachability probe (real raycast, real occlusion):')
    for (const probe of probes) {
      console.log(
        `    ${probe.ok ? 'OK    ' : 'FAILED'}  ${probe.id.padEnd(11)}  ` +
          (probe.ok
            ? `${probe.distance} m from (${probe.from.x}, ${probe.from.z}) in ${probe.room} · "${probe.prompt}"`
            : probe.reason)
      )
    }
    ok(probes.length === 3, 'the three levels name three distinct find targets', `${probes.length}`)
    for (const id of ['water-jug', 'radio', 'wall-photo']) {
      const probe = probes.find((p) => p.id === id)
      ok(probe?.ok === true, `a player can stand somewhere and focus the ${id}`, probe?.reason ?? 'absent')
      ok(
        probe?.ok !== true || probe.distance <= 2.5,
        `the ${id} is focusable within the 2.5 m interaction limit`,
        `${probe?.distance} m`
      )
      ok(
        probe?.ok !== true || /Look at/.test(probe.prompt ?? ''),
        `the ${id}'s prompt says "Look at" and claims no action the game does not perform`,
        probe?.prompt ?? ''
      )
    }
    ok(
      probes.find((p) => p.id === 'radio')?.room === 'livingRoom',
      'the radio is reachable from inside the living room'
    )
    ok(
      probes.find((p) => p.id === 'wall-photo')?.room === 'livingRoom',
      'the framed photograph is reachable from inside the living room'
    )

    // --- the level-selection screen ----------------------------------------
    const levelCard = await cdp.eval('document.querySelector("#overlay .card.levels")?.textContent ?? ""')
    ok(levelCard.length > 0, 'the level-selection screen is the first thing shown')
    for (const title of ['A glass of water', 'Morning walk', 'Familiar memories']) {
      ok(levelCard.includes(title), `the level list offers "${title}"`)
    }
    ok(
      levelCard.toLowerCase().includes('fictional demo data'),
      'the demo pack is labelled as fictional demo data on screen',
      levelCard.slice(0, 160)
    )
    const startButtons = await cdp.eval('document.querySelectorAll("#overlay button[data-level]").length')
    ok(startButtons === 3, 'all three levels have a Start button', `got ${startButtons}`)

    // --- level 1: the original mission, preserved ---------------------------
    await cdp.eval('document.querySelector(\'#overlay button[data-level="0"]\').click()')
    await sleep(400)
    // Start it again inside the kitchen so step 1 completes by §5.5 containment.
    const restarted = await cdp.eval('window.__memoria.debug.restartInRoom("kitchen", 0)')
    console.log('\n  restartInRoom:', restarted)
    await sleep(500)
    ok(
      (await cdp.eval('window.__memoria.runner.stepIndex')) === 1,
      '§5.5 starting level 1 in the kitchen completes step 1'
    )
    const banner = await cdp.eval('document.querySelector("#instruction")?.textContent ?? ""')
    ok(banner.includes('Level 1 of 3'), 'the current level is on screen during play', banner)
    ok(banner.includes('Step 2 of 3'), 'and so is the current task', banner)

    await cdp.eval('window.__memoria.runner.notifyInteract("water-jug")')
    await sleep(200)
    ok(
      (await cdp.eval('window.__memoria.runner.stepIndex')) === 2,
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
    ok(summaryText.includes('Level 1 of 3'), 'the summary names the level it is summarising')

    const actions = JSON.parse(
      await cdp.eval(
        'JSON.stringify([...document.querySelectorAll("#overlay .actions button")].map(b => b.dataset.act))'
      )
    )
    ok(actions.includes('export'), 'the summary offers Download JSON')
    ok(actions.includes('replay'), 'the summary offers Replay')
    ok(actions.includes('levels'), 'the summary offers Level selection')
    ok(actions.includes('next'), 'the summary offers Next level when there is one')

    const summary = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.summary())'))
    console.log('  level 1 summary:', JSON.stringify(summary.outcomes), 'completion', summary.completionTimeMs)
    ok(summary.completed === true, 'level 1 completed offline')
    ok(summary.outcomes.independent === 3, '§4.3 three independent steps', JSON.stringify(summary.outcomes))
    ok(Object.keys(summary.outcomes).length === 4, '§4.3 four outcome counts')
    ok(summary.steps[2].answerLatencyMs !== null, '§4.4 answerLatency present on an answered step')
    ok(summary.steps[2].timeToRevealMs === null, '§4.4 timeToReveal null with no reveal')

    const doc = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.exportJson())'))
    ok(doc.format === 'memoria-telemetry', 'the JSON export builds offline')
    ok(doc.events.length > 5, 'the export carries the recorded log', `${doc.events.length} events`)
    ok(doc.notDiagnostic.includes('not diagnostic'), '§4.4 the export carries the label')
    ok(doc.level.id === 'water', 'the export names the level played', JSON.stringify(doc.level))
    ok(doc.patient.id === 'mira', 'the export names the pack')
    ok(typeof doc.session.attemptId === 'string' && doc.session.attemptId.length > 0,
       'the export names the attempt', doc.session.attemptId)
    ok(doc.session.missionIdsInLog.length === 1, 'the export covers exactly one level')

    // --- level 2: repeated room visits, all three targets --------------------
    await cdp.eval('window.__memoria.debug.startLevel(1)')
    await sleep(400)
    ok((await cdp.eval('window.__memoria.level')) === 1, 'switching to level 2 selects it')
    const afterSwitch = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.summary())'))
    ok(afterSwitch.steps.length === 0, 'switching levels starts from an empty log')
    ok(afterSwitch.outcomes.independent === 0, "level 1's outcomes do not carry over")
    ok(afterSwitch.missionId === 'morning-walk', 'the new log names level 2', String(afterSwitch.missionId))
    ok(
      (await cdp.eval('JSON.stringify(window.__memoria.exportJson().session.missionIdsInLog)')) ===
        '["morning-walk"]',
      'requirement 7: the export never combines events from two attempts'
    )
    ok((await cdp.eval('window.__memoria.runner.steps.length')) === 6, 'level 2 has six steps')

    // Walk it: living room → radio → kitchen → jug → living room → photograph.
    const walk = [
      ['room', 'livingRoom', 1],
      ['interact', 'radio', 2],
      ['room', 'kitchen', 3],
      ['interact', 'water-jug', 4],
      ['room', 'livingRoom', 5],
      ['interact', 'wall-photo', 6]
    ]
    for (const [kind, id, expected] of walk) {
      await cdp.eval(
        kind === 'room'
          ? `window.__memoria.runner.notifyRoom(${JSON.stringify(id)})`
          : `window.__memoria.runner.notifyInteract(${JSON.stringify(id)})`
      )
      await sleep(120)
      if (expected < 6) {
        ok(
          (await cdp.eval('window.__memoria.runner.stepIndex')) === expected,
          `level 2 step ${expected} completes on ${kind} ${id}`
        )
      }
    }
    await sleep(300)
    const two = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.summary())'))
    console.log('  level 2 summary:', JSON.stringify(two.outcomes),
                `rooms ${two.roomsVisited.join('/')} · ${two.roomEntries} entries`)
    ok(two.completed === true, 'level 2 completes')
    ok(two.steps.length === 6, 'level 2 records six step results')
    ok(two.roomsVisited.length === 2, 'level 2 visits two distinct rooms')
    ok(two.roomEntries === 3, 'level 2 counts the repeat visit to the living room', `${two.roomEntries}`)

    // --- level 3: two recall steps, one of each choice format ----------------
    await cdp.eval('window.__memoria.debug.startLevel(2)')
    await sleep(400)
    await cdp.eval('window.__memoria.runner.notifyRoom("livingRoom")')
    await cdp.eval('window.__memoria.runner.notifyInteract("wall-photo")')
    await sleep(300)
    ok((await cdp.eval('window.__memoria.runner.stepIndex')) === 2, 'level 3 reaches the first question')

    const q1Photos = await cdp.eval('document.querySelectorAll("#answer button.choice.photo").length')
    ok(q1Photos === 3, 'level 3 question one shows three photo cards', `got ${q1Photos}`)
    await cdp.eval('document.querySelector(\'#answer button.choice[data-id="bina"]\').click()')
    await sleep(300)
    ok((await cdp.eval('window.__memoria.runner.stepIndex')) === 3, 'level 3 reaches the second question')

    const q2 = JSON.parse(
      await cdp.eval(
        'JSON.stringify([...document.querySelectorAll("#answer button.choice")].map(b => ' +
          '({ id: b.dataset.id, photo: b.classList.contains("photo"), text: b.textContent })))'
      )
    )
    ok(q2.length === 3, 'level 3 question two shows three cards', `got ${q2.length}`)
    ok(q2.every((c) => !c.photo), 'the event question renders text cards, never portraits')
    ok(q2.some((c) => c.text.includes('Bihu')), "the cards show the caregiver's own labels", JSON.stringify(q2.map(c => c.id)))
    await cdp.eval('document.querySelector(\'#answer button.choice[data-id="bihu"]\').click()')
    await sleep(400)

    const three = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.summary())'))
    console.log('  level 3 summary:', JSON.stringify(three.outcomes),
                `latencies ${three.steps.filter((s) => s.type === 'recall').map((s) => s.answerLatencyMs).join(', ')} ms`)
    ok(three.completed === true, 'level 3 completes')
    ok(three.steps.length === 4, 'level 3 records four step results')
    const recallSteps = three.steps.filter((s) => s.type === 'recall')
    ok(recallSteps.length === 2, 'level 3 records two recall steps')
    ok(
      recallSteps.every((s) => s.answerLatencyMs !== null),
      '§4.4 each answered question keeps its own latency'
    )
    ok(three.recallAnswered === 2, '§4.4 the session mean declares it is over two questions')
    const lastDoc = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.exportJson())'))
    ok(lastDoc.level.id === 'familiar-memories', 'the export names level 3', JSON.stringify(lastDoc.level))
    ok(lastDoc.session.missionIdsInLog.length === 1, "level 3's export covers exactly one level")
    ok(lastDoc.summary.steps.length === 4, 'the export carries per-step results')

    // --- back to the level list ---------------------------------------------
    await cdp.eval('document.querySelector(\'#overlay button[data-act="levels"]\').click()')
    await sleep(300)
    const backToList = await cdp.eval('document.querySelector("#overlay .card.levels")?.textContent ?? ""')
    ok(backToList.length > 0, 'Level selection returns to the list')
    ok(backToList.includes('finished'), 'the list marks levels that have been finished')
    const preserved = JSON.parse(await cdp.eval('JSON.stringify(window.__memoria.summary())'))
    ok(
      preserved.completed === true && preserved.steps.length === 4,
      'the finished result is preserved until another attempt is chosen'
    )
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
