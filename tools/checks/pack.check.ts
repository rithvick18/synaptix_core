/**
 * Headless checks for Checkpoint C. Bundled with esbuild and run under node — no
 * browser, so the DOM and three's loaders are stubbed below and every assertion is
 * about MemoryPack's and MissionRunner's own logic.
 */
import * as THREE from 'three'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Environment stubs, installed before MemoryPack is imported for real.
// ---------------------------------------------------------------------------

const MISSING = new Set<string>()

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private url = ''
  set src(value: string) {
    this.url = value
    setTimeout(() => {
      if (MISSING.has(value) || value.includes('__missing__')) this.onerror?.()
      else this.onload?.()
    }, 0)
  }
  get src(): string {
    return this.url
  }
}

const fakeCtx = {
  createLinearGradient: () => ({ addColorStop: () => {} }),
  fillRect: () => {},
  set fillStyle(_v: unknown) {}
}

;(globalThis as Record<string, unknown>).document = {
  baseURI: 'http://localhost/',
  createElement: (tag: string) =>
    tag === 'canvas' ? { width: 0, height: 0, getContext: () => fakeCtx } : {}
}
;(globalThis as Record<string, unknown>).Image = FakeImage

type LoadFn = (url: string, ok: (v: unknown) => void, p: unknown, err: () => void) => void
const fakeLoad =
  (make: (url: string) => unknown): LoadFn =>
  (url, ok, _p, err) => {
    setTimeout(() => (MISSING.has(url) || url.includes('__missing__') ? err() : ok(make(url))), 0)
  }

THREE.TextureLoader.prototype.load = fakeLoad(() => {
  const t = new THREE.Texture()
  ;(t as unknown as { image: unknown }).image = { width: 512, height: 512 }
  return t
}) as never
THREE.AudioLoader.prototype.load = fakeLoad(() => ({ duration: 3 })) as never

import {
  loadMedia,
  validate,
  type PackProblem,
  PackMedia
} from '../../src/MemoryPack'
import { MissionRunner, type MemoryPack, type Mission } from '../../src/Missions'
import type { ChoiceCard } from '../../src/ui'
import { Telemetry, type Event, type Outcome } from '../../src/Telemetry'
import type { WorldSource } from '../../src/World'

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// A world with exactly the §1 required ids and nothing more.
// ---------------------------------------------------------------------------

/** The repository root, handed in by `tools/checks/run.mjs`: the bundle runs from a
 *  temp directory, so nothing relative to this file survives the build. */
const ROOT = process.env.MEMORIA_ROOT ?? process.cwd()

function makeWorld(): WorldSource & { room: string | null } {
  const box = (x0: number, z0: number, x1: number, z1: number): THREE.Box3 =>
    new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 2.7, z1))
  const obj = (): THREE.Object3D => new THREE.Object3D()
  const world = {
    room: null as string | null,
    root: new THREE.Object3D(),
    blockers: [] as THREE.Box3[],
    triggers: [
      { room: 'kitchen', box: box(1.3, -6, 7.5, -0.5) },
      { room: 'livingRoom', box: box(1.3, -0.5, 7.5, 6) }
    ],
    anchors: { livingRoomWall: obj(), bedsideFrame: obj(), audioSource: obj() },
    // Every id §1 requires, and nothing more: the point of this stub is that a pack
    // may lean on the contract and on nothing else.
    interactables: {
      'water-jug': obj(),
      radio: obj(),
      'wall-photo': obj(),
      kitchenDoor: obj()
    },
    hintTargets: {
      kitchenDoor: obj(),
      livingArch: obj(),
      kitchenArch: obj(),
      'water-jug': obj(),
      radio: obj(),
      'wall-photo': obj()
    },
    spawn: { position: new THREE.Vector3(0, 1.6, 10), yaw: 0 },
    roomOf(): string | null {
      return world.room
    }
  }
  return world
}

function readPack(id: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'packs', id, 'pack.json'), 'utf8'))
}

// ---------------------------------------------------------------------------
// 1. The two shipped packs validate cleanly
// ---------------------------------------------------------------------------

for (const id of ['mira', 'raju']) {
  const { pack, problems } = validate(readPack(id), makeWorld())
  ok(pack !== null, `${id}: validates`)
  eq(problems.length, 0, `${id}: no problems at all`)
  eq(pack?.people.length, 3, `${id}: three people`)

  // --- three levels ---------------------------------------------------------
  eq(pack?.missions.length, 3, `${id}: three levels`)
  eq(new Set(pack?.missions.map((m) => m.id)).size, 3, `${id}: three distinct level ids`)
  eq(pack?.missions[0].id, 'water', `${id}: level 1 is the original mission, preserved`)
  eq(pack?.missions[0].steps.length, 3, `${id}: level 1 still has its three steps`)
  eq(pack?.missions[0].steps[0].type, 'navigate', `${id}: level 1 still starts by walking`)
  eq(pack?.missions[0].steps[1].type, 'find', `${id}: level 1 still finds the jug`)
  eq(pack?.missions[0].steps[2].type, 'recall', `${id}: level 1 still ends on one question`)
  eq(pack?.missions[1].steps.length, 6, `${id}: level 2 has six steps`)
  eq(pack?.missions[2].steps.length, 4, `${id}: level 3 has four steps`)
  ok(
    pack!.missions.every((m) => m.description.trim().length > 0),
    `${id}: every level has a description for the selection screen`
  )

  // --- the pack says it is demonstration content ----------------------------
  eq(pack?.demo?.fictional, true, `${id}: declares itself fictional demo data`)
  ok(
    (pack?.demo?.notice ?? '').toLowerCase().includes('fictional'),
    `${id}: and says so in words that will be shown on screen`
  )
  ok(
    (pack?.demo?.notice ?? '').toLowerCase().includes('caregiver'),
    `${id}: and says where real content must come from instead`
  )

  // --- every recall step in every level, in both formats ---------------------
  let recalls = 0
  for (const mission of pack!.missions) {
    mission.steps.forEach((step, i) => {
      const at = `${id}/${mission.id}[${i}]`
      if (step.type !== 'recall') return
      recalls++
      ok(step.choices.includes(step.answer), `${at}: the answer is one of the choices`)
      ok(step.reducedChoices?.includes(step.answer) === true, `${at}: reducedChoices keeps the answer`)
      ok(
        step.reducedChoices!.every((c) => step.choices.includes(c)),
        `${at}: reducedChoices is a subset of choices`
      )
      eq(step.hints.highlight, 'reduce', `${at}: recall level 2 uses the reduce sentinel`)
      if (step.choiceType === 'text') {
        ok(step.options !== undefined, `${at}: a text question carries its options`)
        eq(
          step.choices.filter((c) => step.options!.some((o) => o.id === c)).length,
          step.choices.length,
          `${at}: every text choice has an option behind it`
        )
        ok(
          step.options!.every((o) => o.label.trim().length > 0),
          `${at}: every option has a label to show`
        )
      } else {
        eq(step.options, undefined, `${at}: a person question carries no options`)
        eq(
          step.choices.filter((c) => pack!.people.some((p) => p.id === c)).length,
          step.choices.length,
          `${at}: every person choice names somebody in the pack`
        )
      }
    })
  }
  eq(recalls, 3, `${id}: three recall steps across the three levels`)

  // --- levels 2 and 3 lean only on ids §1 guarantees -------------------------
  const world = makeWorld()
  for (const mission of pack!.missions) {
    for (const step of mission.steps) {
      if (step.type === 'find') {
        ok(
          world.interactables[step.targetObject] !== undefined,
          `${id}/${mission.id}: "${step.targetObject}" is an id the world contract requires`
        )
      }
      if (step.hints.highlight !== 'reduce') {
        ok(
          world.hintTargets[step.hints.highlight] !== undefined,
          `${id}/${mission.id}: hint target "${step.hints.highlight}" is in the contract`
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The levels the brief asked for, by shape rather than by prose
// ---------------------------------------------------------------------------

{
  const pack = validate(readPack('mira'), makeWorld()).pack!
  const [one, two, three] = pack.missions

  // Level 1 — kitchen, jug, one family-photo question.
  const l1 = one.steps
  eq(l1[0].type === 'navigate' && l1[0].targetRoom, 'kitchen', 'level 1: navigate to the kitchen')
  eq(l1[1].type === 'find' && l1[1].targetObject, 'water-jug', 'level 1: find the water jug')
  eq(l1[2].type === 'recall' && l1[2].choiceType, 'person', 'level 1: one family-photo question')

  // Level 2 — living room + radio, kitchen + jug, living room + photograph.
  const l2 = two.steps
  eq(l2[0].type === 'navigate' && l2[0].targetRoom, 'livingRoom', 'level 2: to the living room')
  eq(l2[1].type === 'find' && l2[1].targetObject, 'radio', 'level 2: find the radio')
  eq(l2[2].type === 'navigate' && l2[2].targetRoom, 'kitchen', 'level 2: to the kitchen')
  eq(l2[3].type === 'find' && l2[3].targetObject, 'water-jug', 'level 2: find the water jug')
  eq(l2[4].type === 'navigate' && l2[4].targetRoom, 'livingRoom', 'level 2: back to the living room')
  eq(l2[5].type === 'find' && l2[5].targetObject, 'wall-photo', 'level 2: find the framed photograph')
  ok(l2.every((s) => s.type !== 'recall'), 'level 2: no questions — it is a walk')

  // Level 3 — the photograph, then who, then what.
  const l3 = three.steps
  eq(l3[1].type === 'find' && l3[1].targetObject, 'wall-photo', 'level 3: interact with the photograph')
  eq(l3[2].type === 'recall' && l3[2].choiceType, 'person', 'level 3: question one identifies a person')
  eq(l3[3].type === 'recall' && l3[3].choiceType, 'text', 'level 3: question two is about the event')

  // Requirement 9: an instruction must not claim an action the game does not implement.
  // Pressing E on the jug, the radio and the photograph looks at them and nothing more.
  const forbidden = /\b(pour|pours|pouring|carry|carries|carrying|fetch|fetches|bring|brings|fill|fills|filling|drink|drinks|switch on|turn on|turns on|pick up|picks up)\b/i
  for (const id of ['mira', 'raju']) {
    const p = validate(readPack(id), makeWorld()).pack!
    for (const mission of p.missions) {
      const text = [
        mission.title,
        mission.description,
        ...mission.steps.flatMap((s) => [
          s.type === 'recall' ? s.question : s.instruction,
          s.hints.repeat,
          s.hints.guide
        ])
      ].join(' \u00b7 ')
      ok(
        !forbidden.test(text),
        `${id}/${mission.id}: no instruction implies carrying, pouring or operating anything`
      )
    }
  }
}

// mira and raju must actually differ, or "?patient=raju changes things" is untestable.
{
  const mira = validate(readPack('mira'), makeWorld()).pack!
  const raju = validate(readPack('raju'), makeWorld()).pack!
  ok(mira.patient.name !== raju.patient.name, 'packs: patient names differ')
  const miraIds = mira.people.map((p) => p.id).sort().join(',')
  const rajuIds = raju.people.map((p) => p.id).sort().join(',')
  ok(miraIds !== rajuIds, 'packs: people differ')
  const q = (p: MemoryPack): string => {
    const s = p.missions[0].steps[2]
    return s.type === 'recall' ? s.question : ''
  }
  ok(q(mira) !== q(raju), 'packs: recall questions differ')
  const photos = new Set([...mira.people, ...raju.people].map((p) => p.photo))
  eq(photos.size, 6, 'packs: six distinct photo paths across the two packs')
  const voiceFiles = new Set([...mira.people, ...raju.people].map((p) => p.voice))
  eq(voiceFiles.size, 6, 'packs: six distinct voice files across the two packs')
  for (const person of [...mira.people, ...raju.people]) {
    const p = path.join(ROOT, 'public', person.photo!.replace(/^\//, ''))
    const v = path.join(ROOT, 'public', person.voice!.replace(/^\//, ''))
    ok(fs.existsSync(p) && fs.statSync(p).size > 2000, `media: ${person.id} photo is bundled and non-trivial`)
    ok(fs.existsSync(v) && fs.statSync(v).size > 4000, `media: ${person.id} voice is bundled and audible-sized`)
  }
  for (const [pack, anchors] of [
    ['mira', mira.anchors],
    ['raju', raju.anchors]
  ] as const) {
    for (const rel of Object.values(anchors)) {
      ok(fs.existsSync(path.join(ROOT, 'public', rel.replace(/^\//, ''))), `media: ${pack} anchor ${rel} exists`)
    }
  }
}

// ---------------------------------------------------------------------------
// 2. §4.2 — every problem reported at once
// ---------------------------------------------------------------------------

{
  const { pack, problems } = validate(readPack('broken'), makeWorld())
  eq(pack, null, 'broken: rejected')
  const codes = problems.map((p) => p.code)
  const expect = [
    'patient-name-missing',
    'person-relationship-missing',
    'person-id-duplicate',
    'anchor-unknown',
    'target-room-unknown',
    'target-object-unknown',
    'highlight-unknown',
    'choice-unknown-person',
    'answer-not-in-choices',
    'step-type-unknown',
    // The text-choice format, broken the same ways in the pack's second mission.
    'mission-id-duplicate',
    'choice-type-unknown',
    'options-missing',
    'option-label-missing',
    'option-id-duplicate',
    'choice-unknown-option',
    'options-on-person-question'
  ]
  for (const code of expect) ok(codes.includes(code), `broken: reports ${code}`)
  ok(problems.length >= expect.length, 'broken: every one of them in a single pass')

  // The point of "all at once": faults from every step, not just the first one that failed.
  const steps = new Set(
    problems.map((p) => /steps\[(\d+)\]/.exec(p.where)?.[1]).filter((s): s is string => s !== undefined)
  )
  ok(steps.size >= 4, 'broken: problems come from all four steps, not just the first')
  ok(
    problems.some((p) => p.where.startsWith('patient')) && problems.some((p) => p.where.startsWith('people')),
    'broken: problems also come from sections before the missions'
  )
  ok(
    problems.every((p) => p.message.length > 10 && p.where.length > 0),
    'broken: every problem names a location and says something useful'
  )
}

// ---------------------------------------------------------------------------
// 3. Individual §4.2 rows
// ---------------------------------------------------------------------------

function mutate(fn: (p: Record<string, unknown>) => void): { pack: MemoryPack | null; problems: PackProblem[] } {
  const raw = readPack('mira') as Record<string, unknown>
  fn(raw)
  return validate(raw, makeWorld())
}

function recallOf(raw: Record<string, unknown>): Record<string, unknown> {
  const missions = raw.missions as Record<string, unknown>[]
  return (missions[0].steps as Record<string, unknown>[])[2]
}

{
  // answer not in choices → reject
  const r = mutate((raw) => {
    recallOf(raw).answer = 'bina-the-second'
  })
  eq(r.pack, null, '§4.2 answer-not-in-choices: rejects')
  ok(r.problems.some((p) => p.code === 'answer-not-in-choices'), '§4.2 answer-not-in-choices: code')
}

{
  // a choices id missing from people → reject
  const r = mutate((raw) => {
    recallOf(raw).choices = ['ananya', 'bina', 'stranger']
  })
  eq(r.pack, null, '§4.2 choice-unknown-person: rejects')
}

{
  // targetRoom absent from the world → reject
  const r = mutate((raw) => {
    const missions = raw.missions as Record<string, unknown>[]
    ;(missions[0].steps as Record<string, unknown>[])[0].targetRoom = 'bedroom'
  })
  eq(r.pack, null, '§4.2 target-room-unknown: rejects a room this world lacks')
  ok(
    r.problems.some((p) => p.message.includes('kitchen')),
    '§4.2 target-room-unknown: the message lists what the world does provide'
  )
}

{
  // reducedChoices missing the answer → warn and ignore, never reject
  const r = mutate((raw) => {
    recallOf(raw).reducedChoices = ['bina', 'rupa']
  })
  ok(r.pack !== null, '§4.2 reduced-without-answer: still loads')
  ok(r.problems.some((p) => p.code === 'reduced-without-answer'), '§4.2 reduced-without-answer: warns')
  eq(r.problems[0]?.severity, 'warn', '§4.2 reduced-without-answer: severity is warn')
  const step = r.pack!.missions[0].steps[2]
  ok(step.type === 'recall' && step.reducedChoices === undefined, '§4.2 reduced-without-answer: ignored')
}

{
  // an anchor the world does not have → reject (§1)
  const r = mutate((raw) => {
    ;(raw.anchors as Record<string, string>).porchShelf = '/packs/mira/bihu.jpg'
  })
  eq(r.pack, null, '§1 anchor-unknown: rejects an anchor absent from the world')
}

{
  // `reduce` is a recall sentinel, not a world id — and only on recall steps
  const r = mutate((raw) => {
    const missions = raw.missions as Record<string, unknown>[]
    const nav = (missions[0].steps as Record<string, unknown>[])[0]
    ;(nav.hints as Record<string, unknown>).highlight = 'reduce'
  })
  eq(r.pack, null, 'reduce sentinel: rejected on a navigate step, where it means nothing')
}

// ---------------------------------------------------------------------------
// 3b. The text-choice format — the same rules, checked the same way
// ---------------------------------------------------------------------------

/** Replaces mira's level-1 recall step with one written in the text format. */
function textQuestion(
  patch: (step: Record<string, unknown>) => void
): { pack: MemoryPack | null; problems: PackProblem[] } {
  return mutate((raw) => {
    const step = recallOf(raw)
    step.choiceType = 'text'
    step.options = [
      { id: 'bihu', label: 'Bihu' },
      { id: 'wedding', label: 'A wedding' },
      { id: 'birthday', label: 'A birthday' }
    ]
    step.choices = ['bihu', 'wedding', 'birthday']
    step.answer = 'bihu'
    step.reducedChoices = ['bihu', 'birthday']
    patch(step)
  })
}

{
  const r = textQuestion(() => {})
  ok(r.pack !== null, 'text: a well-formed text question validates')
  eq(r.problems.length, 0, 'text: with no problems')
  const step = r.pack!.missions[0].steps[2]
  ok(step.type === 'recall' && step.choiceType === 'text', 'text: the format survives validation')
  eq(step.type === 'recall' ? step.options?.length : 0, 3, 'text: the options survive too')
}

{
  // Answer membership — the same rejection as the person format.
  const r = textQuestion((step) => {
    step.answer = 'diwali'
  })
  eq(r.pack, null, 'text: an answer outside the choices rejects, exactly as for a person')
  ok(r.problems.some((p) => p.code === 'answer-not-in-choices'), 'text: and reports the same code')
}

{
  // A choice with no option behind it — the text format's "unknown person".
  const r = textQuestion((step) => {
    step.choices = ['bihu', 'diwali']
  })
  eq(r.pack, null, 'text: a choice with no option behind it rejects')
  ok(r.problems.some((p) => p.code === 'choice-unknown-option'), 'text: reports choice-unknown-option')
}

{
  // reducedChoices is checked in both formats, and the failure is the same warning.
  const r = textQuestion((step) => {
    step.reducedChoices = ['wedding', 'birthday']
  })
  ok(r.pack !== null, 'text: reducedChoices without the answer still loads')
  ok(
    r.problems.some((p) => p.code === 'reduced-without-answer' && p.severity === 'warn'),
    'text: and warns, exactly as the person format does'
  )
  const step = r.pack!.missions[0].steps[2]
  ok(step.type === 'recall' && step.reducedChoices === undefined, 'text: the bad reduction is ignored')
}

{
  const r = textQuestion((step) => {
    step.reducedChoices = ['bihu', 'diwali']
  })
  ok(
    r.problems.some((p) => p.code === 'reduced-stray-choice'),
    'text: a reduction naming something that is not a choice is caught in this format too'
  )
}

{
  // A text question with no options at all cannot render anything.
  const r = textQuestion((step) => {
    delete step.options
  })
  eq(r.pack, null, 'text: a text question with no options rejects')
  ok(r.problems.some((p) => p.code === 'options-missing'), 'text: reports options-missing')
}

{
  // Options on a person question are a category error, not a silent extra.
  const r = mutate((raw) => {
    recallOf(raw).options = [{ id: 'ananya', label: 'Ananya' }]
  })
  eq(r.pack, null, 'text: options on a person question reject')
  ok(r.problems.some((p) => p.code === 'options-on-person-question'), 'text: and say why')
}

{
  // An unused option is a warning: nothing breaks, but the caregiver should know.
  const r = textQuestion((step) => {
    step.choices = ['bihu', 'wedding']
  })
  ok(r.pack !== null, 'text: an unused option does not stop the level')
  ok(r.problems.some((p) => p.code === 'option-unused' && p.severity === 'warn'), 'text: it warns')
}

{
  // An unknown choiceType is rejected rather than guessed at.
  const r = mutate((raw) => {
    recallOf(raw).choiceType = 'freeform'
  })
  eq(r.pack, null, 'text: an unknown choiceType rejects')
  ok(r.problems.some((p) => p.code === 'choice-type-unknown'), 'text: reports choice-type-unknown')
}

{
  // Omitting choiceType means `person`, so §4.1's original example still validates.
  const r = mutate((raw) => {
    delete recallOf(raw).choiceType
  })
  ok(r.pack !== null, 'text: omitting choiceType is allowed')
  const step = r.pack!.missions[0].steps[2]
  eq(step.type === 'recall' ? step.choiceType : null, 'person', 'text: and means "person"')
}

{
  // Two levels with the same id would make the export ambiguous.
  const r = mutate((raw) => {
    const missions = raw.missions as Record<string, unknown>[]
    missions[1].id = missions[0].id
  })
  eq(r.pack, null, 'levels: two levels sharing an id reject')
  ok(r.problems.some((p) => p.code === 'mission-id-duplicate'), 'levels: reports mission-id-duplicate')
}

{
  // A missing description is a warning: the screen shows a title and no line.
  const r = mutate((raw) => {
    delete (raw.missions as Record<string, unknown>[])[1].description
  })
  ok(r.pack !== null, 'levels: a level with no description still runs')
  ok(
    r.problems.some((p) => p.code === 'mission-description-missing' && p.severity === 'warn'),
    'levels: and warns about it'
  )
  eq(r.pack!.missions[1].description, '', 'levels: the engine writes no description of its own')
}

{
  // The demo notice is validated but never invented.
  const r = mutate((raw) => {
    delete raw.demo
  })
  ok(r.pack !== null, 'demo: a pack with no notice is perfectly valid')
  eq(r.pack!.demo, undefined, 'demo: and gets no notice added for it')

  const bad = mutate((raw) => {
    raw.demo = { fictional: true }
  })
  eq(bad.pack, null, 'demo: a notice block with nothing to say rejects')
}

// ---------------------------------------------------------------------------
// 4. Media — §4.2's photo, voice and anchor rows
// ---------------------------------------------------------------------------

const abs = (p: string): string => new URL(p.replace(/^\/+/, ''), 'http://localhost/').href

async function mediaFor(pack: MemoryPack, missing: string[] = []) {
  MISSING.clear()
  for (const m of missing) MISSING.add(abs(m))
  const result = await loadMedia(pack)
  MISSING.clear()
  return result
}

const miraPack = validate(readPack('mira'), makeWorld()).pack!

{
  const { media, problems } = await mediaFor(miraPack)
  eq(problems.length, 0, 'media: nothing missing → no warnings')
  eq(media.cardStyle('water', 2), 'photo', 'media: all photos present → photo cards')
  for (const person of miraPack.people) {
    ok(media.photoFor(person.id) !== null, `media: ${person.id} photo available`)
    ok(media.voiceFor(person.id) !== null, `media: ${person.id} voice available`)
  }
  eq(media.anchorTextures.size, 2, 'media: both anchors got a texture')
}

{
  // ***** The confirmation the report is asked for. *****
  // One recall photo gone — Ananya's, which is also the answer — and the whole
  // question must fall back to text. Never one text card among photographs.
  const { media, problems } = await mediaFor(miraPack, ['/packs/mira/ananya.jpg'])
  eq(media.cardStyle('water', 2), 'text', '§4.2 one photo missing → the question is text-only')
  eq(media.photoFor('ananya'), null, '§4.2 the missing photo is not available')
  ok(media.photoFor('bina') !== null, '§4.2 the other photos did load (so this is a real fallback)')
  ok(media.photoFor('rupa') !== null, '§4.2 the third photo did load too')
  ok(problems.some((p) => p.code === 'person-photo-failed'), '§4.2 missing photo warns')
  ok(problems.some((p) => p.code === 'question-text-only'), '§4.2 the text-only fallback is reported')
  ok(
    problems.every((p) => p.severity === 'warn'),
    '§4.2 a missing photo is a degradation, never a rejection'
  )
}

{
  // Same rule when the missing photo is a distractor rather than the answer.
  const { media } = await mediaFor(miraPack, ['/packs/mira/rupa.jpg'])
  eq(media.cardStyle('water', 2), 'text', '§4.2 a missing *distractor* photo also forces text')
}

{
  // Voice missing → silent, continue.
  const { media, problems } = await mediaFor(miraPack, ['/packs/mira/bina.mp3'])
  eq(media.voiceFor('bina'), null, '§4.2 missing voice → no buffer')
  ok(media.voiceFor('ananya') !== null, '§4.2 missing voice does not affect other people')
  eq(media.cardStyle('water', 2), 'photo', '§4.2 a missing voice does NOT force text cards')
  ok(problems.some((p) => p.code === 'voice-failed' && p.severity === 'warn'), '§4.2 missing voice warns')
}

{
  // Decorative anchor photo missing → neutral placeholder, warn, continue.
  const { media, problems } = await mediaFor(miraPack, ['/packs/mira/bihu.jpg'])
  ok(media.anchorTextures.get('livingRoomWall') !== undefined, '§4.2 missing anchor photo → placeholder texture')
  ok(
    problems.some((p) => p.code === 'anchor-photo-failed' && p.severity === 'warn'),
    '§4.2 missing anchor photo warns'
  )
  eq(media.cardStyle('water', 2), 'photo', '§4.2 a missing wall photo does not change the cards')
}

// ---------------------------------------------------------------------------
// 5. The runner renders what the media decided
// ---------------------------------------------------------------------------

class FakeState {
  current = 'exploring'
  timersRunning = true
  private ms = 0
  elapsed(): number {
    return this.ms
  }
  advance(ms: number): void {
    this.ms += ms
  }
  set(next: string): void {
    this.current = next
  }
}

class FakeUI {
  card: Record<string, unknown> | null = null
  overlayVisible = false
  hint: string | null = null
  completion: { label: string; outcome: string }[] | null = null
  get answerCardVisible(): boolean {
    return this.card !== null
  }
  get choices(): ChoiceCard[] {
    return (this.card?.choices as ChoiceCard[]) ?? []
  }
  showAnswerCard(o: Record<string, unknown>): void {
    this.card = o
  }
  updateAnswerCard(patch: Record<string, unknown>): void {
    if (this.card) this.card = { ...this.card, ...patch }
  }
  hideAnswerCard(): void {
    this.card = null
  }
  showInstruction(): void {}
  hideInstruction(): void {}
  setHint(t: string | null): void {
    this.hint = t
  }
  showCompletion(_t: string, rows: { label: string; outcome: string }[]): void {
    this.completion = rows
  }
}

class FakePlayer {
  releaseLock(): void {}
  requestLock(): void {}
  groundPoint(): THREE.Vector3 {
    return new THREE.Vector3()
  }
}

class FakeVoices {
  played: string[] = []
  stopped = 0
  play(id: string): boolean {
    this.played.push(id)
    return true
  }
  stop(): void {
    this.stopped++
  }
}

interface Rig {
  runner: MissionRunner
  ui: FakeUI
  state: FakeState
  world: ReturnType<typeof makeWorld>
  voices: FakeVoices
  events: Event[]
}

function rig(pack: MemoryPack, media: PackMedia, mission: Mission = pack.missions[0]): Rig {
  const world = makeWorld()
  const state = new FakeState()
  const ui = new FakeUI()
  const voices = new FakeVoices()
  const events: Event[] = []
  const telemetry = new Telemetry(() => state.elapsed())
  telemetry.onEvent = (e) => events.push(e)
  const runner = new MissionRunner({
    pack,
    mission,
    world: world as unknown as WorldSource,
    player: new FakePlayer() as never,
    state: state as never,
    telemetry,
    ui: ui as never,
    media,
    voices: voices as never,
    levelLabel: `Level 1 of ${pack.missions.length}`
  })
  return { runner, ui, state, world, voices, events }
}

/** Walk a rig to the recall step the quick way: skip the first two. */
function toRecall(r: Rig): void {
  r.runner.start()
  r.runner.skip()
  r.runner.skip()
}

{
  const { media } = await mediaFor(miraPack)
  const r = rig(miraPack, media)
  toRecall(r)
  const cards = r.ui.choices
  eq(cards.length, 3, 'runner: three choice cards')
  ok(cards.every((c) => !!c.photoUrl), 'runner: every card has a photo when every photo loaded')
  ok(cards.every((c) => c.hasVoice === true), 'runner: every card reports a voice')
  ok(
    new Set(cards.map((c) => c.photoUrl)).size === 3,
    'runner: the three cards show three different photos'
  )
}

{
  // ***** The confirmation, at the level the player actually sees. *****
  const { media } = await mediaFor(miraPack, ['/packs/mira/ananya.jpg'])
  const r = rig(miraPack, media)
  toRecall(r)
  const cards = r.ui.choices
  eq(cards.length, 3, 'runner/text: still three cards')
  ok(
    cards.every((c) => c.photoUrl === null),
    '§4.2 one photo deleted → ALL choices render as text cards'
  )
  ok(
    !cards.some((c) => c.photoUrl),
    '§4.2 not one photo card survives — the answer is not singled out'
  )

  // Level 2 swaps in the reduced list. The style must not change mid-question.
  r.state.advance(46_000)
  r.runner.update()
  eq(r.runner.level, 2, 'runner/text: level 2 reached')
  const reduced = r.ui.choices
  eq(reduced.length, 2, 'runner/text: level 2 reduced to two choices')
  ok(
    reduced.every((c) => c.photoUrl === null),
    '§4.2 the reduced list stays text-only too — the style never changes mid-question'
  )
  ok(reduced.some((c) => c.id === 'ananya'), '§5.4 level 2 keeps the answer')
}

{
  // A distractor's photo missing produces the same all-text card set.
  const { media } = await mediaFor(miraPack, ['/packs/mira/bina.jpg'])
  const r = rig(miraPack, media)
  toRecall(r)
  ok(r.ui.choices.every((c) => c.photoUrl === null), '§4.2 distractor photo missing → all text as well')
}

{
  // Missing voice → that card is silent, the others are not, and nothing else changes.
  const { media } = await mediaFor(miraPack, ['/packs/mira/rupa.mp3'])
  const r = rig(miraPack, media)
  toRecall(r)
  const cards = r.ui.choices
  ok(cards.every((c) => !!c.photoUrl), '§4.2 missing voice leaves photo cards alone')
  eq(cards.find((c) => c.id === 'rupa')?.hasVoice, false, '§4.2 the silent card says so')
  eq(cards.find((c) => c.id === 'ananya')?.hasVoice, true, '§4.2 the others still speak')
}

{
  // Every choice speaks, not only the answer — playing only on a correct pick would be
  // a correctness signal, which §5.4 rules out.
  const { media } = await mediaFor(miraPack)
  const r = rig(miraPack, media)
  toRecall(r)
  const onSelect = r.ui.card!.onSelect as (id: string) => void
  onSelect('bina')
  eq(r.voices.played.join(','), 'bina', '§5.4 a non-answer choice plays its own voice')
  ok(r.ui.card !== null, '§5.4 a non-answer choice does not end the step')
  onSelect('ananya')
  eq(r.voices.played.join(','), 'bina,ananya', '§5.4 the answer plays its voice too')
  eq(r.ui.card, null, 'runner: the correct answer ends the step')
}

{
  // Level 3 on a recall step reveals and speaks the answer.
  const { media } = await mediaFor(miraPack)
  const r = rig(miraPack, media)
  toRecall(r)
  r.state.advance(76_000)
  r.runner.update()
  eq(r.runner.level, 3, 'runner: level 3 reached on the recall step')
  eq(r.ui.card?.revealedId, 'ananya', '§5.4 level 3 reveals the answer')
  eq(r.voices.played.join(','), 'ananya', '§5.4 the reveal speaks in the answer’s own voice')
}

{
  // §4.2's last resort: a question with nothing renderable is skipped, not left open.
  const stripped: MemoryPack = {
    ...miraPack,
    people: [],
    missions: [
      {
        ...miraPack.missions[0],
        steps: [miraPack.missions[0].steps[2]]
      }
    ]
  }
  const { media } = await mediaFor(miraPack)
  const r = rig(stripped, media)
  r.runner.start()
  eq(r.ui.card, null, '§4.2 all choice rendering fails → no card is left on screen')
  const ended = r.events.find((e) => e.kind === 'step_end') as { outcome?: Outcome } | undefined
  eq(ended?.outcome, 'skipped', '§4.2 all choice rendering fails → outcome skipped')
}

// ---------------------------------------------------------------------------
// 6. Checkpoint B behaviour that Checkpoint C touched — regression
// ---------------------------------------------------------------------------

{
  const { media } = await mediaFor(miraPack)

  // §5.5 containment at step start.
  const r = rig(miraPack, media)
  r.world.room = 'kitchen'
  r.runner.start()
  eq(r.runner.stepIndex, 1, '§5.5 already in the kitchen → step 1 completes at once')
  const first = r.events.find((e) => e.kind === 'step_end') as { outcome?: Outcome } | undefined
  eq(first?.outcome, 'independent', '§5.5 completing on arrival is independent')

  // §5.6 the same thing after a reset, which is what "restart in the kitchen" is.
  r.runner.reset()
  eq(r.voices.stopped > 0, true, '§5.6 reset stops pack audio')
  r.world.room = 'kitchen'
  r.runner.start()
  eq(r.runner.stepIndex, 1, '§5.6 restart taken in the kitchen → step 1 completes, no hang')

  // §5.4 level 3 must not auto-complete navigate or find.
  const n = rig(miraPack, media)
  n.world.room = null
  n.runner.start()
  n.state.advance(76_000)
  n.runner.update()
  eq(n.runner.level, 3, '§5.4 navigate reaches level 3')
  eq(n.runner.stepIndex, 0, '§5.4 level 3 does NOT auto-complete a navigate step')
  n.world.room = 'kitchen'
  n.runner.notifyRoom('kitchen')
  eq(n.runner.stepIndex, 1, '§5.4 walking there after guidance completes it')
  const nav = n.events.filter((e) => e.kind === 'step_end') as { outcome?: Outcome }[]
  eq(nav[0]?.outcome, 'cued', '§4.3 performing it yourself after level-3 guidance is cued')

  // Find steps likewise.
  const f = rig(miraPack, media)
  f.runner.start()
  f.runner.notifyRoom('kitchen')
  eq(f.runner.stepIndex, 1, 'find: step 2 is the find step')
  f.state.advance(76_000)
  f.runner.update()
  eq(f.runner.stepIndex, 1, '§5.4 level 3 does NOT auto-complete a find step')
  f.runner.notifyInteract('water-jug')
  eq(f.runner.stepIndex, 2, '§5.4 pressing E after guidance completes it')

  // Timers freeze while paused.
  const t = rig(miraPack, media)
  t.runner.start()
  t.state.timersRunning = false
  t.state.advance(200_000)
  t.runner.update()
  eq(t.runner.level, 0, '§5.1 no hint fires while the clock is stopped')
  t.state.timersRunning = true
  t.runner.update()
  eq(t.runner.level, 3, '§5.1 the ladder catches up once the clock runs again')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
