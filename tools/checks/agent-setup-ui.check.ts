/**
 * Headless checks for the caregiver setup screen (`src/agent/caregiverSetup.ts`) and the
 * review list it renders (`src/agent/setupUI.ts`).
 *
 * Until now the review UI had no automated coverage at all — it was on the manual
 * verification list, which meant the claims that matter most (an edited proposal commits
 * the caregiver's words, a blocked proposal shows its rule id, only the texture
 * derivative reaches the pack) were resting on reading the code. A small fake DOM is
 * enough to exercise the real modules end to end, so those claims are now checked rather
 * than asserted.
 *
 * No network and no provider: the screen takes an injected `ProviderAdapter`, so these
 * tests drive it with scripted tool calls exactly as a real run would deliver them.
 */

// --- a minimal DOM, installed before the modules under test are imported ---------

interface Listener {
  (event?: unknown): void
}

class FakeElement {
  children: FakeElement[] = []
  parent: FakeElement | null = null
  className = ''
  textContent = ''
  src = ''
  alt = ''
  type = ''
  accept = ''
  multiple = false
  rows = 0
  value = ''
  disabled = false
  hidden = false
  files: unknown = null
  readonly dataset: Record<string, string> = {}
  readonly attributes: Record<string, string> = {}
  private listeners = new Map<string, Listener[]>()

  constructor(readonly tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parent = this
    this.children.push(child)
    return child
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) child.parent = null
    this.children = []
    for (const node of nodes) this.appendChild(node)
  }

  remove(): void {
    if (!this.parent) return
    this.parent.children = this.parent.children.filter((c) => c !== this)
    this.parent = null
  }

  replaceWith(other: FakeElement): void {
    if (!this.parent) return
    const index = this.parent.children.indexOf(this)
    if (index >= 0) {
      other.parent = this.parent
      this.parent.children[index] = other
    }
    this.parent = null
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  addEventListener(type: string, handler: Listener): void {
    const existing = this.listeners.get(type) ?? []
    existing.push(handler)
    this.listeners.set(type, existing)
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }

  click(): void {
    this.dispatch('click')
  }

  querySelectorAll(): FakeElement[] {
    return []
  }

  getBoundingClientRect(): { width: number; height: number } {
    return { width: 100, height: 100 }
  }

  /** Depth-first walk, used by the assertions below to find rendered controls. */
  descendants(): FakeElement[] {
    return this.children.flatMap((c) => [c, ...c.descendants()])
  }
}

interface FakeCanvas {
  width: number
  height: number
  getContext(kind: '2d'): unknown
  toBlob(cb: (b: Blob | null) => void, type: string, quality?: number): void
}

;(globalThis as unknown as { document: unknown }).document = {
  createElement(tag: string): FakeElement | FakeCanvas {
    if (tag === 'canvas') {
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          imageSmoothingQuality: 'low',
          fillRect() {},
          drawImage() {}
        }),
        toBlob(cb, type) {
          cb(new Blob([`CANVAS-REENCODE:${canvas.width}x${canvas.height}`], { type }))
        }
      }
      return canvas
    }
    return new FakeElement(tag)
  }
}

interface FakeSource {
  __width: number
  __height: number
}

;(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = async (file: Blob & FakeSource) => ({
  width: file.__width,
  height: file.__height,
  close() { /* no-op */ }
})

const objectUrls = new Map<string, Blob>()
const revokedUrls = new Set<string>()
let urlCounter = 0
;(globalThis as unknown as { URL: unknown }).URL = Object.assign(
  // `new URL(...)` still has to work: llamaCpp.ts uses it for loopback detection.
  globalThis.URL,
  {
    createObjectURL(blob: Blob): string {
      const url = `blob:fake/${++urlCounter}`
      objectUrls.set(url, blob)
      return url
    },
    revokeObjectURL(url: string): void {
      revokedUrls.add(url)
    }
  }
)

// --- modules under test ---------------------------------------------------------

import { CaregiverSetupScreen, buildSystemPrompt, worldFactsFromSource, type WorldFacts } from '../../src/agent/caregiverSetup'
import { DEFAULT_AGENT_CONFIG, type AgentConfig } from '../../src/agent/config'
import { resetProposalIds } from '../../src/agent/tools'
import type { ProviderAdapter, ProviderRequest, ProviderResult, ProviderToolCall } from '../../src/agent/provider'
import type { MemoryPack } from '../../src/Missions'

let checks = 0
const failures: string[] = []

function ok(condition: boolean, label: string): void {
  checks++
  if (!condition) failures.push(label)
}

function eq<T>(actual: T, expected: T, label: string): void {
  checks++
  if (actual !== expected) failures.push(`${label}\n     expected ${String(expected)}, got ${String(actual)}`)
}

function fakePhoto(width: number, height: number, type = 'image/jpeg'): Blob {
  const blob = new Blob([`ORIGINAL-WITH-EXIF:${width}x${height}`], { type }) as Blob & FakeSource
  Object.assign(blob, { __width: width, __height: height })
  return blob
}

const world: WorldFacts = {
  rooms: ['livingRoom', 'kitchen'],
  interactables: ['water-jug', 'radio'],
  hintTargets: ['kitchenDoor', 'livingArch', 'water-jug'],
  anchors: [
    { id: 'livingRoomWall', contentType: 'wall', aspect: 1.5 },
    { id: 'bedsideFrame', contentType: 'portrait', aspect: 0.75 }
  ]
}

const emptyPack: MemoryPack = { patient: { name: 'Test' }, people: [], anchors: {}, missions: [] }

class ScriptedProvider implements ProviderAdapter {
  seen: ProviderRequest | null = null
  constructor(private readonly toolCalls: ProviderToolCall[]) {}
  async run(request: ProviderRequest): Promise<ProviderResult> {
    this.seen = request
    return { ok: true, toolCalls: this.toolCalls, model: 'local-test-model' }
  }
}

class FailingProvider implements ProviderAdapter {
  calls = 0
  async run(): Promise<ProviderResult> {
    this.calls += 1
    return { ok: false, reason: 'network', message: 'Could not reach the local model server.' }
  }
}

interface Harness {
  screen: CaregiverSetupScreen
  container: FakeElement
  committed: { pack: MemoryPack }[]
  config: AgentConfig
}

function mount(provider: ProviderAdapter, options: { consent?: boolean; config?: Partial<AgentConfig> } = {}): Harness {
  const container = new FakeElement('body')
  const committed: { pack: MemoryPack }[] = []
  const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, provider: 'llamacpp', model: 'local-test-model', ...options.config }
  const screen = new CaregiverSetupScreen({
    container: container as unknown as HTMLElement,
    world,
    basePack: emptyPack,
    config,
    saveConfig() { /* persistence is localStorage's job, not this test's */ },
    onCommit(pack) { committed.push({ pack }) },
    onClose() { /* no-op */ },
    provider,
    askConsent: async () => options.consent ?? true,
    audit: { record() { /* silence the console in checks */ } } as never
  })
  return { screen, container, committed, config }
}

function buttonLabelled(root: FakeElement, text: string): FakeElement | undefined {
  return root.descendants().find((el) => el.tagName === 'button' && el.textContent === text)
}

function textOf(root: FakeElement): string {
  return root.descendants().map((el) => el.textContent).join(' | ')
}

// ---------------------------------------------------------------------------
// 1. Upload — the pipeline runs per file and the gallery reflects it
// ---------------------------------------------------------------------------

{
  resetProposalIds()
  const provider = new ScriptedProvider([])
  const { screen, container } = mount(provider)

  const runButton = buttonLabelled(container, 'Draft suggestions')
  ok(runButton !== undefined, 'upload: the screen renders a run button')
  eq(runButton?.disabled, true, 'upload: it is disabled until a photograph is added')

  await screen.addFiles([fakePhoto(800, 600), fakePhoto(640, 480)])

  const figures = container.descendants().filter((el) => el.tagName === 'figure')
  eq(figures.length, 2, 'upload: both photographs appear in the gallery')
  eq(runButton?.disabled, false, 'upload: the run button enables once there is something to work from')
  ok(textOf(container).includes('800×600'), 'upload: the gallery reports the decoded dimensions')

  const images = container.descendants().filter((el) => el.tagName === 'img')
  eq(images.length, 2, 'upload: one thumbnail per photograph')
  const thumb = objectUrls.get(images[0].src)
  eq(await thumb?.text(), 'CANVAS-REENCODE:256x192', 'upload: the review UI shows the 256px thumb, not the original')
}

// ---------------------------------------------------------------------------
// 2. A rejected file does not fail the batch
// ---------------------------------------------------------------------------

{
  const { screen, container } = mount(new ScriptedProvider([]))
  await screen.addFiles([fakePhoto(800, 600, 'image/gif'), fakePhoto(800, 600)])
  const figures = container.descendants().filter((el) => el.tagName === 'figure')
  eq(figures.length, 1, 'upload: an unsupported file is skipped and the good one still lands')
  ok(textOf(container).includes('Unsupported format'), 'upload: and the caregiver is told why')
}

// ---------------------------------------------------------------------------
// 3. Declining consent means no model call at all (§10.6)
// ---------------------------------------------------------------------------

{
  const provider = new FailingProvider()
  const { screen, container } = mount(provider, { consent: false })
  await screen.addFiles([fakePhoto(800, 600)])
  await screen.run()

  eq(provider.calls, 0, 'consent: declining calls no provider whatsoever')
  ok(textOf(container).includes('by hand'), 'consent: declining leaves the caregiver on manual authoring (§10.9)')
}

// ---------------------------------------------------------------------------
// 4. A provider failure degrades to manual authoring, never a blocked screen
// ---------------------------------------------------------------------------

{
  const { screen, container } = mount(new FailingProvider())
  await screen.addFiles([fakePhoto(800, 600)])
  await screen.run()

  ok(textOf(container).includes('Could not reach the local model server.'), 'failure: the provider message is shown verbatim')
  eq(buttonLabelled(container, 'Draft suggestions')?.disabled, false, 'failure: the caregiver can try again')
  eq(buttonLabelled(container, 'Add approved items to the game')?.disabled, true, 'failure: nothing is committable')
}

// ---------------------------------------------------------------------------
// 5. Only the probe derivative is sent to the model (§10.5 rule 4)
// ---------------------------------------------------------------------------

{
  resetProposalIds()
  const provider = new ScriptedProvider([])
  const { screen } = mount(provider)
  await screen.addFiles([fakePhoto(800, 600)])
  await screen.run()

  const sent = provider.seen
  ok(sent !== null, 'egress: the provider was called')
  eq(sent?.probeImages.length, 1, 'egress: exactly one image was offered')
  const decoded = Buffer.from(sent?.probeImages[0].base64 ?? '', 'base64').toString('utf8')
  eq(decoded, 'CANVAS-REENCODE:800x600', 'egress: what left was the probe re-encode — not the original, not the texture')
  ok(!decoded.includes('EXIF'), 'egress: the original EXIF-bearing bytes never reach a provider')
  eq(sent?.probeImages[0].mimeType, 'image/jpeg', 'egress: always JPEG, whatever was uploaded')
}

// ---------------------------------------------------------------------------
// 6. Review — the firewall runs on arrival and its rejections are legible
// ---------------------------------------------------------------------------

{
  resetProposalIds()
  // "Devika" is never written in the caregiver's notes, so F-a must block this.
  const provider = new ScriptedProvider([
    { tool: 'propose_person', args: { name: 'Devika', relationship: 'daughter', photoAssetId: 'asset-1' } }
  ])
  const { screen, container } = mount(provider)
  await screen.addFiles([fakePhoto(800, 600)])
  await screen.run()

  const rendered = textOf(container)
  ok(rendered.includes('Blocked by the content firewall'), 'review: a blocked proposal says so')
  ok(rendered.includes('F-a'), 'review: the rule id is shown (§10.3)')
  ok(rendered.includes('Devika'), 'review: the offending token is shown, never silently dropped')
  ok(rendered.includes('Accepted') && rendered.includes('Blocked by firewall'), 'review: §10.8 provenance counters are on screen')
}

// ---------------------------------------------------------------------------
// 7. Accept → commit builds a pack, and it carries the texture, not the probe
// ---------------------------------------------------------------------------

{
  resetProposalIds()
  const provider = new ScriptedProvider([
    { tool: 'propose_person', args: { name: 'Ananya', relationship: 'granddaughter', photoAssetId: 'asset-1' } },
    { tool: 'propose_photo_placement', args: { assetId: 'asset-1', anchorId: 'livingRoomWall', crop: { x: 0, y: 0, width: 1, height: 1 }, rationale: 'A wide photograph for the wall.' } }
  ])
  const { screen, container, committed } = mount(provider)
  await screen.addFiles([fakePhoto(800, 600)])

  // The notes box is what licenses "Ananya" — typed by the caregiver, per §10.3.
  const notesBoxes = container.descendants().filter((el) => el.tagName === 'textarea')
  notesBoxes[1].value = 'Ananya is my granddaughter.'
  notesBoxes[1].dispatch('input')

  await screen.run()

  const acceptButtons = container.descendants().filter((el) => el.tagName === 'button' && el.textContent === 'Accept')
  eq(acceptButtons.length, 2, 'commit: both proposals passed the firewall and offer Accept')
  for (const button of acceptButtons) button.click()

  const commitButton = buttonLabelled(container, 'Add approved items to the game')
  eq(commitButton?.disabled, false, 'commit: the commit button enables once something is accepted')
  commitButton?.click()

  eq(committed.length, 1, 'commit: onCommit fired exactly once')
  const pack = committed[0].pack
  eq(pack.people.length, 1, 'commit: the person landed in the pack')
  eq(pack.people[0].name, 'Ananya', 'commit: with the caregiver-licensed name')

  const anchorUrl = pack.anchors.livingRoomWall
  ok(anchorUrl !== undefined, 'commit: the photo placement became a pack anchor')
  eq(
    await objectUrls.get(anchorUrl)?.text(),
    'CANVAS-REENCODE:1024x1024',
    'commit: the world gets the power-of-two texture derivative, not the probe or the original'
  )
  eq(
    await objectUrls.get(pack.people[0].photo ?? '')?.text(),
    'CANVAS-REENCODE:1024x1024',
    "commit: the person's photo is the texture derivative too"
  )

  ok(pack.provenance !== undefined, 'commit: the pack carries a §10.8 provenance block')
  eq(pack.provenance?.agentAssisted, true, 'commit: provenance says the pack was agent-assisted')
  eq(pack.provenance?.proposals.accepted, 2, 'commit: provenance counts both acceptances')
  eq(pack.provenance?.model, 'local-test-model', 'commit: provenance records which model proposed')
}

// ---------------------------------------------------------------------------
// 8. An edited proposal commits the caregiver's words, never the model's
// ---------------------------------------------------------------------------

{
  resetProposalIds()
  const provider = new ScriptedProvider([
    { tool: 'propose_person', args: { name: 'Ananya', relationship: 'granddaughter', photoAssetId: 'asset-1' } }
  ])
  const { screen, container, committed } = mount(provider)
  await screen.addFiles([fakePhoto(800, 600)])
  const notesBoxes = container.descendants().filter((el) => el.tagName === 'textarea')
  notesBoxes[1].value = 'Ananya is my granddaughter. We call her Anu.'
  notesBoxes[1].dispatch('input')
  await screen.run()

  // The caregiver rewrites the relationship before accepting. `session.edit` is what the
  // review list calls; going through the screen's session keeps this a real path.
  const session = (screen as unknown as { session: { list(): { proposal: { proposalId: string } }[]; edit(id: string, patch: unknown): void } }).session
  const id = session.list()[0].proposal.proposalId
  session.edit(id, { name: 'Anu' })

  buttonLabelled(container, 'Accept')?.click()
  buttonLabelled(container, 'Add approved items to the game')?.click()

  eq(committed.length, 1, 'edit: the edited proposal committed')
  eq(committed[0].pack.people[0].name, 'Anu', "edit: the pack carries the caregiver's text, not the model's")
  eq(committed[0].pack.provenance?.proposals.edited, 1, 'edit: provenance counts it as edited, not accepted')
  eq(committed[0].pack.provenance?.proposals.accepted, 0, 'edit: and does not double-count it as a plain acceptance')
}

// ---------------------------------------------------------------------------
// 9. Rejecting is terminal, and closing releases every object URL
// ---------------------------------------------------------------------------

{
  resetProposalIds()
  const provider = new ScriptedProvider([
    { tool: 'propose_navigate_step', args: { targetRoom: 'kitchen', instruction: 'Please go to the kitchen.', hints: { repeat: 'Please go to the kitchen.', highlight: 'kitchenDoor', guide: 'Through this door.' } } }
  ])
  const { screen, container, committed } = mount(provider)
  await screen.addFiles([fakePhoto(800, 600)])
  await screen.run()

  buttonLabelled(container, 'Reject')?.click()
  ok(textOf(container).includes('Rejected'), 'reject: the row says so')
  eq(buttonLabelled(container, 'Add approved items to the game')?.disabled, true, 'reject: nothing is committable')
  eq(committed.length, 0, 'reject: a rejected proposal cannot reach a pack')

  const before = revokedUrls.size
  screen.close()
  ok(revokedUrls.size > before, 'close: object URLs are released rather than leaked')
  eq(container.children.length, 0, 'close: the screen removes itself')
}

// ---------------------------------------------------------------------------
// 10. The prompt carries the resolved read tools, and no caregiver-invented ids
// ---------------------------------------------------------------------------

{
  const prompt = buildSystemPrompt(world, [{ id: 'asset-1', kind: 'image', width: 800, height: 600 }], 'Ananya is my granddaughter.')
  ok(prompt.includes('livingRoomWall'), 'prompt: anchors are resolved into the prompt, not left to a tool call')
  ok(prompt.includes('water-jug'), 'prompt: findable objects are listed')
  ok(prompt.includes('kitchenDoor'), 'prompt: hint targets are listed')
  ok(prompt.includes('asset-1'), 'prompt: uploaded asset ids are listed')
  ok(prompt.includes('Ananya is my granddaughter.'), "prompt: the caregiver's notes are included verbatim")
  ok(prompt.includes('request_caregiver_input'), 'prompt: the escape hatch is offered explicitly')
  ok(prompt.includes('Never guess'), 'prompt: guessing is named as the thing not to do')
}

// ---------------------------------------------------------------------------
// 11. Deriving world facts from a live world source
// ---------------------------------------------------------------------------

{
  const THREE = await import('three')
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.05))
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.05))
  const source = {
    anchors: { bedsideFrame: frame, livingRoomWall: wall },
    interactables: { 'water-jug': new THREE.Object3D() },
    hintTargets: { kitchenDoor: new THREE.Object3D() },
    triggers: [{ room: 'kitchen' }, { room: 'livingRoom' }, { room: 'kitchen' }]
  }
  const facts = worldFactsFromSource(source as never)

  eq(facts.rooms.join(','), 'kitchen,livingRoom', 'worldFacts: rooms are de-duplicated from the triggers')
  eq(facts.interactables.join(','), 'water-jug', 'worldFacts: interactables come straight off the world')
  eq(facts.anchors.length, 2, 'worldFacts: every anchor is described')

  const bedside = facts.anchors.find((a) => a.id === 'bedsideFrame')
  eq(bedside?.contentType, 'portrait', 'worldFacts: a bedside frame is a portrait anchor')
  ok((bedside?.aspect ?? 0) < 1, 'worldFacts: and reports a portrait aspect ratio')

  const livingRoom = facts.anchors.find((a) => a.id === 'livingRoomWall')
  eq(livingRoom?.contentType, 'wall', 'worldFacts: a wall anchor is a wall anchor')
  ok((livingRoom?.aspect ?? 0) > 1, 'worldFacts: and reports a landscape aspect ratio')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
