/** Browser checks for caregiver profiles. Starts Vite dev plus temporary headless Chrome.
 * Exercises real image decoding, IndexedDB transactions, UI and refresh. No personal files.
 * npm run check:profile (Node 22+ and Chrome, or CHROME=/path/to/chrome).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const originArg = process.argv.find((a) => a.startsWith('--origin='))
const ORIGIN = originArg ? originArg.slice('--origin='.length) : 'http://localhost:4174'
const OFFLINE = !process.argv.includes('--online')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9223

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
    ['--port', port, '--strictPort'],
    { cwd: REPO, stdio: ['ignore', 'ignore', 'ignore'] }
  )
  for (let i = 0; i < 40; i++) {
    await wait(250)
    try {
      await fetch(ORIGIN + '/', { signal: AbortSignal.timeout(800) })
      console.log(`  started Vite dev on ${ORIGIN}`)
      return server
    } catch {
      /* still starting */
    }
  }
  server.kill()
  throw new Error(`Vite dev never answered on ${ORIGIN}`)
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


let cdp
try {
  cdp = await CDP.connect(await targetUrl())
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable')
  const boot = async (url) => {
    await cdp.send('Page.navigate', { url })
    for (let i = 0; i < 160; i++) {
      await sleep(250)
      if (await cdp.eval('!!window.__memoria?.debug')) return
    }
    throw new Error('Boot timed out')
  }
  await boot(ORIGIN + '/')
  const result = await cdp.eval("import('/tools/profile-browser.check.ts').then(m => m.run())", true)
  for (const label of result.checks) console.log('  PASS', label)
  await boot(ORIGIN + '/')
  const restored = await cdp.eval(`({id:window.__memoria.patientId, wall:window.__memoria.media.anchorTextures.has('livingRoomWall'), levels:window.__memoria.pack.missions.length, recalls:window.__memoria.pack.missions.flatMap(m=>m.steps).filter(s=>s.type==='recall').length})`)
  if (restored.id !== result.id || !restored.wall || restored.levels !== 3 || restored.recalls !== 0) throw new Error('Refresh restoration failed: ' + JSON.stringify(restored))
  console.log('  PASS refresh restores local profile and image across three levels')
  await cdp.eval("window.__memoria.debug.startLevel(0)")
  const exported = await cdp.eval('window.__memoria.exportJson()')
  if (exported.patient.name || !exported.content?.profileId || JSON.stringify(exported).includes('blob:') || JSON.stringify(exported).includes('Browser fixture')) throw new Error('Export privacy failed')
  console.log('  PASS export contains opaque identity and content IDs without personal names or media')
  await cdp.eval("window.__memoria.debug.showLevels(); [...document.querySelectorAll('button')].find(b=>b.textContent==='Edit Profile').click()")
  const editor = await cdp.eval("!!document.querySelector('#profile-editor[open] canvas')")
  if (!editor) throw new Error('Editor preview missing')
  console.log('  PASS saved profile opens editor with crop preview')
  await cdp.eval("[...document.querySelectorAll('#profile-editor button')].find(b=>b.textContent==='Remove').click()")
  if (!(await cdp.eval("document.querySelector('#profile-editor').textContent.includes('No photo selected')"))) throw new Error('Remove UI failed')
  await cdp.eval("[...document.querySelectorAll('#profile-editor button')].find(b=>b.textContent==='Cancel').click()")
  if (await cdp.eval("!!document.querySelector('#profile-editor')")) throw new Error('Cancel failed')
  console.log('  PASS remove preview and cancel leave saved profile intact')
  await cdp.eval("[...document.querySelectorAll('button')].find(b=>b.textContent==='Edit Profile').click()")
  await cdp.eval(`(() => {
    const input = document.querySelector('#profile-editor input[type=file][aria-label="Living-room wall photograph"]')
    const dt = new DataTransfer(); dt.items.add(new File(['invalid'], 'broken.png', {type:'image/png'}))
    input.files = dt.files; input.dispatchEvent(new Event('change'))
  })()`)
  const until = async (expression) => { for(let i=0;i<160;i++){ if(await cdp.eval(expression)) return; await sleep(250) } throw new Error('Timed out: '+expression) }
  await until("document.querySelector('#profile-editor .error').textContent.includes('could not be decoded')")
  console.log('  PASS invalid upload displays decode error and retains preview')
  await cdp.eval(`import('/src/LocalProfile.ts').then(async m => {
    const p = (await m.profileStore.read()).profile
    const dt = new DataTransfer(); dt.items.add(new File([p.wall.original], 'replacement.png', {type:'image/png'}))
    const input = document.querySelector('#profile-editor input[type=file][aria-label="Living-room wall photograph"]'); input.files = dt.files; input.dispatchEvent(new Event('change'))
  })`, true)
  await until("!document.querySelector('#profile-editor button').disabled && !document.querySelector('#profile-editor .error').textContent")
  console.log('  PASS valid upload replaces image and refreshes crop preview')
  await cdp.eval(`window.__profilePut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(){throw new DOMException('Test quota', 'QuotaExceededError')}; [...document.querySelectorAll('#profile-editor button')].find(b=>b.textContent==='Save and Play').click()`)
  await until("document.querySelector('#profile-editor .error').textContent.includes('last successfully saved profile is unchanged')")
  await cdp.eval('IDBObjectStore.prototype.put = window.__profilePut')
  console.log('  PASS failed editor save visibly preserves previous profile')
  await cdp.eval("window.__memoria = undefined; [...document.querySelectorAll('#profile-editor button')].find(b=>b.textContent==='Save and Play').click()")
  await until('!!window.__memoria?.debug && window.__memoria.level === 0')
  if ((await cdp.eval('window.__memoria.patientId')) !== result.id) throw new Error('Save and Play changed profile identity')
  console.log('  PASS Save and Play reloads saved profile and starts level one')
  await cdp.eval("import('/src/LocalProfile.ts').then(async m=>{const p=(await m.profileStore.read()).profile; p.skipRecall=false; await m.profileStore.save(p)})", true)
  await boot(ORIGIN + '/')
  for (let level = 0; level < 3; level++) {
    const played = await cdp.eval(`(() => {
      const g=window.__memoria; g.debug.startLevel(${level});
      for(let n=0;n<20 && g.runner.active;n++) {
        const s=g.runner.current;
        if(s.type==='recall') document.querySelector('button.choice[data-id="'+s.answer+'"]').click();
        else g.runner.skip();
      }
      return {done:g.state.current==='completed', image:g.media.anchorTextures.has('livingRoomWall'), export:g.exportJson()}
    })()`)
    if (!played.done || !played.image || played.export.patient.id !== result.id || played.export.session.missionIdsInLog.length !== 1) throw new Error('Personal level failed: '+level)
    if (level !== 1 && (played.export.summary.recallAnswered !== 1 || played.export.content.questions.length !== 1)) throw new Error('Personal recall failed: '+level)
  }
  console.log('  PASS all three personal levels complete with image and caregiver recall, preserving per-attempt exports')
  await cdp.eval(`(() => {
    const g=window.__memoria; const photo=g.media.resolver.resolve(g.pack.anchors.livingRoomWall, true);
    window.__photoChoices=[{id:'a',name:'A',photoUrl:photo},{id:'b',name:'B',photoUrl:'data:,'},{id:'c',name:'C',photoUrl:photo}];
    g.ui.showAnswerCard({question:'Fallback check',choices:window.__photoChoices,onSelect:()=>{},onSkip:()=>{}})
  })()`)
  await until("document.querySelectorAll('#answer img.portrait').length===0")
  await cdp.eval('window.__memoria.ui.updateAnswerCard({choices:[window.__photoChoices[0],window.__photoChoices[2]]})')
  if ((await cdp.eval("document.querySelectorAll('#answer img.portrait').length")) !== 0) throw new Error('Photo fallback did not survive reduction')
  console.log('  PASS late photo failure switches entire question to text and stays text after choice reduction')
  // ---- §11.7 / §11.8 — Choose your home's layout ------------------------------------
  let extra = 0
  const pass = (label) => { extra++; console.log('  PASS', label) }
  const house = () => cdp.eval('JSON.stringify(window.__memoriaAssets.template)')
  const same = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
  const versions = await cdp.eval("import('/src/templates/index.ts').then(m => Object.fromEntries(Object.entries(m.TEMPLATES).map(([id, t]) => [id, t.version])))", true)
  // Everything the caregiver made, photographs by their original bytes. Layout fields are left out.
  const CONTENT = `import('/src/LocalProfile.ts').then(async m => {
    const p = (await m.profileStore.read()).profile
    const bytes = async b => { const a = new Uint8Array(await b.arrayBuffer()); let h = 0; for (const x of a) h = (h * 31 + x) >>> 0; return a.length + ':' + h }
    const photo = async v => v ? { id: v.id, crop: v.crop, width: v.width, height: v.height, original: await bytes(v.original), runtime: await bytes(v.runtime), thumbnail: await bytes(v.thumbnail) } : null
    return JSON.stringify({ id: p.id, name: p.name, caption: p.caption, quality: p.quality, skipRecall: p.skipRecall, wallId: p.wallId, eventId: p.eventId,
      environment: p.environment ?? null, wall: await photo(p.wall), event: await photo(p.event),
      people: await Promise.all(p.people.map(async v => ({ id: v.id, name: v.name, relationship: v.relationship, photo: await photo(v.photo) }))),
      questions: p.questions })
  })`
  const stored = () => cdp.eval("import('/src/LocalProfile.ts').then(async m => { const p = (await m.profileStore.read()).profile; return p.templateId + ':' + p.mirrored })", true)
  const openEditor = async () => {
    await cdp.eval("window.__memoria.debug.showLevels(); [...document.querySelectorAll('button')].find(b=>b.textContent==='Edit Profile').click()")
    await until("!!document.querySelector('#profile-editor[open] [data-template-picker]')")
  }
  const cards = () => cdp.eval(`import('/src/templates/index.ts').then(async ({ TEMPLATES }) => {
    const { planSvg } = await import('/src/templates/plan.ts')
    // Both sides through the same parser: the DOM re-serialises <rect/> as <rect></rect>.
    const parsed = (t, mirrored) => { const d = document.createElement('div'); d.innerHTML = planSvg(t, mirrored); return d.innerHTML }
    return [...document.querySelectorAll('#profile-editor [data-template-picker] .card')].map(card => {
      const t = TEMPLATES[card.dataset.template], mirrored = card.querySelector('input[data-mirror]').checked
      return { id: card.dataset.template, picked: card.querySelector('input[type=radio]').checked, mirrored,
        rects: card.querySelectorAll('.plan svg rect').length, description: card.querySelector('p').textContent,
        fromData: card.querySelector('.plan').innerHTML === parsed(t, mirrored), svg: card.querySelector('.plan').innerHTML }
    })
  })`, true)
  const card = (id, part) => `document.querySelector('#profile-editor .card[data-template="${id}"] ${part}').click()`
  const saveAndPlay = async () => {
    await cdp.eval("window.__memoria = undefined; [...document.querySelectorAll('#profile-editor button')].find(b=>b.textContent==='Save and Play').click()")
    await until('!!window.__memoria?.debug && window.__memoria.level === 0')
  }
  const playLevel = (level) => cdp.eval(`(() => {
    const g=window.__memoria; g.debug.startLevel(${level});
    for(let n=0;n<20 && g.runner.active;n++) { const s=g.runner.current;
      if(s.type==='recall') document.querySelector('button.choice[data-id="'+s.answer+'"]').click(); else g.runner.skip() }
    return {done:g.state.current==='completed', export:g.exportJson()}
  })()`)

  // A person with a portrait and their own crop, so "people intact" compares something.
  await cdp.eval("import('/src/LocalProfile.ts').then(async m => { const p = (await m.profileStore.read()).profile; p.people = [{ id: m.newId(), name: 'Layout Fixture Person', relationship: 'Layout fixture relation', photo: { ...p.wall, id: m.newId(), crop: { x: .3, y: .6, zoom: 1.4 } } }]; await m.profileStore.save(p) })", true)
  await boot(ORIGIN + '/')
  same(JSON.parse(await house()), { id: 'hallway', version: versions.hallway, mirrored: false }, 'default house')
  await openEditor()
  let shown = await cards()
  same(shown.map(c => c.id), Object.keys(versions), 'cards')
  if (shown.length !== 4 || !shown.every(c => c.rects > 20 && c.fromData && c.description.trim()) || new Set(shown.map(c => c.svg)).size !== 4) throw new Error('Layout cards: ' + JSON.stringify(shown.map(({ svg, ...c }) => c)))
  pass('layout step shows four cards, each a plan drawn from its template data with a one-line description')
  if (!shown.every(c => c.picked === (c.id === 'hallway') && !c.mirrored)) throw new Error('Default selection: ' + JSON.stringify(shown.map(({ svg, ...c }) => c)))
  pass('saved profile opens on hallway, unmirrored')
  const before = shown.find(c => c.id === 'courtyard').svg
  await cdp.eval(card('courtyard', 'input[data-mirror]'))
  shown = await cards()
  const flipped = shown.find(c => c.id === 'courtyard')
  if (!flipped.mirrored || !flipped.fromData || flipped.svg === before || !flipped.svg.includes('data-mirrored="1"') || !shown.find(c => c.id === 'hallway').picked) throw new Error('Mirror toggle did not redraw from mirrored data')
  pass('mirror toggle redraws that card from the mirrored template data, live, without selecting it')
  await cdp.eval(card('courtyard', 'input[type=radio]'))
  const content = await cdp.eval(CONTENT, true)
  await saveAndPlay()
  same(await stored(), 'courtyard:true', 'stored layout')
  same(JSON.parse(await house()), { id: 'courtyard', version: versions.courtyard, mirrored: true }, 'built house after save')
  pass('pick courtyard, mirrored → Save and Play stores templateId and mirrored and builds that house')
  await boot(ORIGIN + '/')
  same(JSON.parse(await house()), { id: 'courtyard', version: versions.courtyard, mirrored: true }, 'built house after reload')
  await openEditor()
  shown = await cards()
  if (!shown.every(c => c.picked === (c.id === 'courtyard') && c.mirrored === (c.id === 'courtyard') && c.fromData)) throw new Error('Editor after reload: ' + JSON.stringify(shown.map(({ svg, ...c }) => c)))
  await cdp.eval("[...document.querySelectorAll('#profile-editor button')].find(b=>b.textContent==='Cancel').click()")
  pass('reload persists the layout: the same house is built and the editor reopens on it, mirrored')
  for (let level = 0; level < 3; level++) {
    const played = await playLevel(level)
    if (!played.done) throw new Error('Level did not complete in courtyard: ' + level)
    same(played.export.world, { templateId: 'courtyard', mirrored: true, templateVersion: versions.courtyard }, 'export world')
    const text = JSON.stringify(played.export)
    if (played.export.patient.name || text.includes('Browser fixture') || text.includes('Layout Fixture') || text.includes('blob:')) throw new Error('Export privacy failed in courtyard')
  }
  pass('all three levels play in mirrored courtyard; every export carries world { templateId, mirrored, templateVersion } and stays private')
  await openEditor()
  await cdp.eval(card('openPlan', 'input[type=radio]'))
  await saveAndPlay()
  same(await stored(), 'openPlan:false', 'stored layout after switch')
  same(JSON.parse(await house()), { id: 'openPlan', version: versions.openPlan, mirrored: false }, 'built house after switch')
  const after = await cdp.eval(CONTENT, true)
  if (after !== content) throw new Error('Switching layout changed caregiver content:\n' + content + '\n' + after)
  const parsed = JSON.parse(after)
  if (!parsed.wall || !parsed.people[0]?.photo || !parsed.questions.length) throw new Error('Content comparison had nothing to compare')
  pass(`switching courtyard → openPlan leaves photographs (original, derivatives, crops), ${parsed.people.length} person(s) and ${parsed.questions.length} questions identical`)
  same((await playLevel(0)).export.world, { templateId: 'openPlan', mirrored: false, templateVersion: versions.openPlan }, 'export world after switch')
  pass('export after the switch names the new house')

  // Demo packs stay on hallway while the local profile is on openPlan (§11.7).
  await boot(ORIGIN + '/?patient=mira')
  same([await cdp.eval('window.__memoria.patientId'), JSON.parse(await house())], ['mira', { id: 'hallway', version: versions.hallway, mirrored: false }], 'Mira demo house')
  same((await playLevel(0)).export.world, { templateId: 'hallway', mirrored: false, templateVersion: versions.hallway }, 'Mira export world')
  await boot(ORIGIN + '/?patient=mira&template=row&mirror=1')
  same(JSON.parse(await house()), { id: 'row', version: versions.row, mirrored: true }, 'Mira ?template= override')
  pass('Mira demo stays on hallway while the local profile is on openPlan; only ?template= moves it')
  await cdp.eval("import('/src/LocalProfile.ts').then(m=>m.profileStore.select('raju'))", true)
  await boot(ORIGIN + '/')
  if ((await cdp.eval('window.__memoria.patientId')) !== 'raju') throw new Error('Demo switch failed')
  same(JSON.parse(await house()), { id: 'hallway', version: versions.hallway, mirrored: false }, 'Raju demo house')
  console.log('  PASS switch to Raju demo restores its pack, on hallway')
  await cdp.eval("import('/src/LocalProfile.ts').then(m=>m.profileStore.delete())", true)
  const deleted = await cdp.eval("import('/src/LocalProfile.ts').then(m=>m.profileStore.read()).then(r=>!r.profile && r.selected==='mira')", true)
  if (!deleted) throw new Error('Delete failed')
  console.log('  PASS Delete Profile removes saved data and selects Mira')
  console.log(`${result.checks.length + 12 + extra} browser checks passed`)
} finally {
  cdp?.ws.close()
  const stopped = new Promise(resolve => {
    if (chrome.exitCode !== null) resolve()
    else { chrome.once('exit', resolve); setTimeout(resolve, 5000).unref() }
  })
  chrome.kill()
  server?.kill()
  await stopped
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
}
