import * as THREE from 'three'
import { MediaResolver, cropRect } from './PhotoMedia'
import type { Crop } from './LocalProfile'
import type {
  ChoiceFormat,
  DemoNotice,
  MemoryPack,
  Mission,
  Person,
  RecallStep,
  Step,
  TextChoice
} from './Missions'
import { ANCHOR_PLATE } from './proceduralHouse'
import type { StageProgress } from './ui'
import type { WorldSource } from './World'

/**
 * SPEC.md §4.2 / §1 — Checkpoint C: fetch a caregiver pack, validate it, load its media,
 * and inject that media into the running world.
 *
 * Three rules shape this file.
 *
 * 1. **Every problem is reported at once.** Validation never returns on the first fault.
 *    A caregiver fixing a pack should see the whole list, not one item per reload, so
 *    `validate` accumulates and only then decides whether anything was fatal.
 *
 * 2. **Rejections and degradations are different things.** §4.2 splits them: a broken
 *    *reference* (an answer outside its choices, a room the world does not have) makes
 *    the pack unrunnable and rejects it; missing *media* never does — a missing wall
 *    photo becomes a neutral plate, a missing voice becomes silence.
 *
 * 3. **Photo cards are decided per question, never per choice.** If any one photo in a
 *    recall question fails, every choice in that question falls back to a text card.
 *    A single text card among photos is a free answer: the odd one out is the one being
 *    asked about. That is the whole reason the rule exists, so the decision is taken
 *    here, once, over the question's full choice list — which is a superset of its
 *    `reducedChoices` — and the renderer enforces it again independently.
 */

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

export interface PackProblem {
  /** `reject` makes the pack unrunnable; `warn` is a degradation that still plays. */
  severity: 'reject' | 'warn'
  /** Stable machine-readable code, e.g. `answer-not-in-choices`. */
  code: string
  /** Where in the pack, in path form: `missions[0].steps[2].answer`. */
  where: string
  message: string
}

export class PackRejected extends Error {
  constructor(
    readonly patientId: string,
    readonly problems: PackProblem[]
  ) {
    super(`Pack "${patientId}" rejected: ${problems.filter((p) => p.severity === 'reject').length} problem(s)`)
    this.name = 'PackRejected'
  }

  get rejections(): PackProblem[] {
    return this.problems.filter((p) => p.severity === 'reject')
  }
}

class Problems {
  readonly all: PackProblem[] = []

  reject(code: string, where: string, message: string): void {
    this.all.push({ severity: 'reject', code, where, message })
  }

  warn(code: string, where: string, message: string): void {
    this.all.push({ severity: 'warn', code, where, message })
  }

  get fatal(): boolean {
    return this.all.some((p) => p.severity === 'reject')
  }
}

// ---------------------------------------------------------------------------
// Paths
//
// §4.1 writes media paths site-absolute (`/packs/mira/ananya.jpg`). Vite is configured
// with `base: './'` so the build can be served from a subdirectory, which a leading
// slash would defeat. Resolving against `document.baseURI` honours the pack's paths
// while keeping the build portable, and leaves absolute URLs alone.
// ---------------------------------------------------------------------------

export function resolvePackPath(path: string): string {
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
  return new URL(path.replace(/^\/+/, ''), base).href
}

/** `?patient=` is a filesystem path segment; only this shape is ever interpolated. */
const PATIENT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/

export function patientIdFromLocation(search: string, fallback = 'mira'): string {
  const raw = new URLSearchParams(search).get('patient')
  return raw && raw.length > 0 ? raw : fallback
}

/**
 * `?break=photo:ananya,voice:bina,anchor:livingRoomWall`
 *
 * Verification handle for §4.2's three degradation rows. It does not shortcut the
 * fallback: it rewrites the named file's URL to one that is guaranteed absent, so the
 * ordinary "it failed to load" path runs exactly as it would if the file were deleted
 * from `public/packs/`. Absent from the query string, nothing changes.
 */
export function breakagesFromLocation(search: string): Set<string> {
  const raw = new URLSearchParams(search).get('break')
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

// ---------------------------------------------------------------------------
// Validation (§4.2)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

/** Recall steps use `hints.highlight` as a mode sentinel, not as a world id (§4.1). */
export const REDUCE_SENTINEL = 'reduce'

/**
 * Checks a parsed pack against §4.2 and against the ids the active world actually
 * provides (§1). Returns the typed pack alongside every problem found — including when
 * some of them are fatal, so the caller can list them all.
 */
export function validate(raw: unknown, world: WorldSource, allowEmptyPeople = false): { pack: MemoryPack | null; problems: PackProblem[] } {
  const p = new Problems()

  if (!isObject(raw)) {
    p.reject('not-an-object', '(root)', 'The pack is not a JSON object.')
    return { pack: null, problems: p.all }
  }

  // --- patient ---------------------------------------------------------------
  const patientRaw = raw.patient
  let patientName = 'Patient'
  if (!isObject(patientRaw) || !str(patientRaw.name)) {
    p.reject('patient-name-missing', 'patient.name', 'A pack must name the patient.')
  } else {
    patientName = str(patientRaw.name)!
  }

  // --- people ----------------------------------------------------------------
  const people: Person[] = []
  const peopleIds = new Set<string>()
  if (!Array.isArray(raw.people) || (!allowEmptyPeople && raw.people.length === 0)) {
    p.reject('people-missing', 'people', 'A pack must list at least one person.')
  } else {
    raw.people.forEach((entry: unknown, i: number) => {
      const at = `people[${i}]`
      if (!isObject(entry)) {
        p.reject('person-malformed', at, 'Each person must be an object.')
        return
      }
      const id = str(entry.id)
      const name = str(entry.name)
      const relationship = str(entry.relationship)
      if (!id) p.reject('person-id-missing', `${at}.id`, 'Each person needs an id.')
      if (!name) p.reject('person-name-missing', `${at}.name`, 'Each person needs a name.')
      if (!relationship) {
        p.reject('person-relationship-missing', `${at}.relationship`, 'Each person needs a relationship.')
      }
      if (id && peopleIds.has(id)) {
        p.reject('person-id-duplicate', `${at}.id`, `Two people share the id "${id}".`)
      }
      if (id && name && relationship) {
        peopleIds.add(id)
        people.push({
          id,
          name,
          relationship,
          photo: str(entry.photo) ?? undefined,
          voice: str(entry.voice) ?? undefined
        })
      }
    })
  }

  // --- anchors ---------------------------------------------------------------
  // §1: "A pack referencing an id absent from the active world is a load-time
  // rejection." That covers anchor mount points as much as rooms and objects — a photo
  // hung on a wall this house does not have is a pack written for another world. The
  // *photo file* going missing is the separate, non-fatal row in §4.2.
  const anchors: Record<string, string> = {}
  if (raw.anchors !== undefined) {
    if (!isObject(raw.anchors)) {
      p.reject('anchors-malformed', 'anchors', 'anchors must be an object of anchorId → image path.')
    } else {
      for (const [id, value] of Object.entries(raw.anchors)) {
        const path = str(value)
        if (!path) {
          p.reject('anchor-path-missing', `anchors.${id}`, `Anchor "${id}" has no image path.`)
          continue
        }
        if (!world.anchors[id]) {
          p.reject(
            'anchor-unknown',
            `anchors.${id}`,
            `This world has no anchor "${id}". It provides: ${Object.keys(world.anchors).join(', ')}.`
          )
          continue
        }
        anchors[id] = path
      }
    }
  }

  // --- missions --------------------------------------------------------------
  const rooms = new Set(world.triggers.map((t) => t.room))
  const missions: Mission[] = []
  const missionIds = new Set<string>()

  if (!Array.isArray(raw.missions) || raw.missions.length === 0) {
    p.reject('missions-missing', 'missions', 'A pack must contain at least one mission.')
  } else {
    raw.missions.forEach((entry: unknown, m: number) => {
      const at = `missions[${m}]`
      if (!isObject(entry)) {
        p.reject('mission-malformed', at, 'Each mission must be an object.')
        return
      }
      const id = str(entry.id)
      const title = str(entry.title)
      if (!id) p.reject('mission-id-missing', `${at}.id`, 'Each mission needs an id.')
      if (!title) p.reject('mission-title-missing', `${at}.title`, 'Each mission needs a title.')
      if (id && missionIds.has(id)) {
        // Levels are addressed by mission id — in the export, in `?level=`, and in the
        // check that no two attempts share a log. Two levels called the same thing
        // would make every one of those ambiguous.
        p.reject('mission-id-duplicate', `${at}.id`, `Two missions share the id "${id}".`)
      }
      if (id) missionIds.add(id)

      // The level-selection screen shows a line under each title. It is caregiver text
      // like everything else, so a pack that omits it gets a blank line, not an
      // engine-written summary of its own steps (§2).
      const description = str(entry.description)
      if (!description) {
        p.warn(
          'mission-description-missing',
          `${at}.description`,
          'This mission has no description; the level-selection screen will show only its title.'
        )
      }

      if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
        p.reject('mission-steps-missing', `${at}.steps`, 'Each mission needs at least one step.')
        return
      }

      const steps: Step[] = []
      entry.steps.forEach((rawStep: unknown, s: number) => {
        const step = validateStep(rawStep, `${at}.steps[${s}]`, { world, rooms, peopleIds }, p)
        if (step) steps.push(step)
      })

      if (id && title && steps.length === entry.steps.length) {
        missions.push({ id, title, description: description ?? '', steps })
      }
    })
  }

  // --- demo notice -----------------------------------------------------------
  // Optional, and deliberately not inferred: a pack is demonstration content only if it
  // says so. A caregiver pack describing a real patient omits the block and nothing is
  // labelled.
  let demo: DemoNotice | undefined
  if (raw.demo !== undefined) {
    if (!isObject(raw.demo)) {
      p.reject('demo-malformed', 'demo', 'demo must be an object with `fictional` and `notice`.')
    } else {
      const notice = str(raw.demo.notice)
      if (typeof raw.demo.fictional !== 'boolean') {
        p.reject('demo-fictional-missing', 'demo.fictional', 'demo.fictional must be true or false.')
      } else if (!notice) {
        p.reject('demo-notice-missing', 'demo.notice', 'demo needs a notice to display on screen.')
      } else {
        demo = { fictional: raw.demo.fictional, notice }
      }
    }
  }

  if (p.fatal) return { pack: null, problems: p.all }
  return {
    pack: { patient: { name: patientName }, people, anchors, missions, demo },
    problems: p.all
  }
}

interface StepContext {
  world: WorldSource
  rooms: Set<string>
  peopleIds: Set<string>
}

function validateStep(raw: unknown, at: string, ctx: StepContext, p: Problems): Step | null {
  if (!isObject(raw)) {
    p.reject('step-malformed', at, 'Each step must be an object.')
    return null
  }

  // Hints are required for all three types; their meaning differs by type below.
  const hintsRaw = raw.hints
  let repeat: string | null = null
  let guide: string | null = null
  let highlight: string | null = null
  if (!isObject(hintsRaw)) {
    p.reject('hints-missing', `${at}.hints`, 'Every step needs hints: repeat, highlight and guide.')
  } else {
    repeat = str(hintsRaw.repeat)
    guide = str(hintsRaw.guide)
    highlight = str(hintsRaw.highlight)
    if (!repeat) p.reject('hint-repeat-missing', `${at}.hints.repeat`, 'The level-1 hint is missing.')
    if (!guide) p.reject('hint-guide-missing', `${at}.hints.guide`, 'The level-3 hint is missing.')
    if (!highlight) p.reject('hint-highlight-missing', `${at}.hints.highlight`, 'The level-2 hint is missing.')
  }
  const hints = repeat && guide && highlight ? { repeat, guide, highlight } : null

  const type = str(raw.type)

  /** §4.2: a highlight id the world does not have is a rejection. */
  const checkHighlight = (): void => {
    if (!highlight) return
    if (!ctx.world.hintTargets[highlight]) {
      p.reject(
        'highlight-unknown',
        `${at}.hints.highlight`,
        `This world has no hint target "${highlight}". It provides: ${Object.keys(ctx.world.hintTargets).join(', ')}.`
      )
    }
  }

  if (type === 'navigate') {
    const targetRoom = str(raw.targetRoom)
    const instruction = str(raw.instruction)
    if (!targetRoom) p.reject('target-room-missing', `${at}.targetRoom`, 'A navigate step needs a targetRoom.')
    else if (!ctx.rooms.has(targetRoom)) {
      p.reject(
        'target-room-unknown',
        `${at}.targetRoom`,
        `This world has no room "${targetRoom}". It provides: ${[...ctx.rooms].join(', ')}.`
      )
    }
    if (!instruction) p.reject('instruction-missing', `${at}.instruction`, 'A navigate step needs an instruction.')
    checkHighlight()
    if (!targetRoom || !instruction || !hints || !ctx.rooms.has(targetRoom)) return null
    return { type: 'navigate', targetRoom, instruction, hints }
  }

  if (type === 'find') {
    const targetObject = str(raw.targetObject)
    const instruction = str(raw.instruction)
    if (!targetObject) p.reject('target-object-missing', `${at}.targetObject`, 'A find step needs a targetObject.')
    else if (!ctx.world.interactables[targetObject]) {
      p.reject(
        'target-object-unknown',
        `${at}.targetObject`,
        `This world has no interactable "${targetObject}". It provides: ${Object.keys(ctx.world.interactables).join(', ')}.`
      )
    }
    if (!instruction) p.reject('instruction-missing', `${at}.instruction`, 'A find step needs an instruction.')
    checkHighlight()
    if (!targetObject || !instruction || !hints || !ctx.world.interactables[targetObject]) return null
    return { type: 'find', targetObject, instruction, hints }
  }

  if (type === 'recall') {
    const question = str(raw.question)
    const answer = str(raw.answer)
    if (!question) p.reject('question-missing', `${at}.question`, 'A recall step needs a question.')

    // --- which choice format? ------------------------------------------------
    // Declared, not sniffed. Omitting it means `person`, which is what §4.1's example
    // pack uses and what every pack written before text choices existed meant.
    const declared = raw.choiceType === undefined ? 'person' : str(raw.choiceType)
    let choiceType: ChoiceFormat = 'person'
    if (declared !== 'person' && declared !== 'text') {
      p.reject(
        'choice-type-unknown',
        `${at}.choiceType`,
        `Unknown choiceType "${declared ?? '(malformed)'}" — expected "person" or "text".`
      )
    } else {
      choiceType = declared
    }

    // --- options, for the text format ----------------------------------------
    const options: TextChoice[] = []
    const optionIds = new Set<string>()
    if (raw.options !== undefined) {
      if (choiceType !== 'text') {
        p.reject(
          'options-on-person-question',
          `${at}.options`,
          'options belongs to a text question; a person question takes its labels from `people`.'
        )
      } else if (!Array.isArray(raw.options) || raw.options.length < 2) {
        p.reject('options-missing', `${at}.options`, 'A text question needs at least two options.')
      } else {
        raw.options.forEach((o: unknown, i: number) => {
          const where = `${at}.options[${i}]`
          if (!isObject(o)) {
            p.reject('option-malformed', where, 'Each option must be an object with an id and a label.')
            return
          }
          const id = str(o.id)
          const label = str(o.label)
          if (!id) p.reject('option-id-missing', `${where}.id`, 'Each option needs an id.')
          if (!label) p.reject('option-label-missing', `${where}.label`, 'Each option needs a label to show.')
          if (id && optionIds.has(id)) {
            p.reject('option-id-duplicate', `${where}.id`, `Two options share the id "${id}".`)
            return
          }
          if (id && label) {
            optionIds.add(id)
            options.push({ id, label, detail: str(o.detail) ?? undefined })
          }
        })
      }
    } else if (choiceType === 'text') {
      p.reject(
        'options-missing',
        `${at}.options`,
        'A text question must list its options; there is no `people` entry to read a label from.'
      )
    }

    // --- choices, in whichever format ----------------------------------------
    // The membership rule is the only thing that differs: a person choice must name
    // somebody in `people`, a text choice must name one of this step's own options.
    // Everything after this point — answer membership, reducedChoices — is shared, so
    // neither format can quietly skip a check the other gets.
    const known = choiceType === 'text' ? optionIds : ctx.peopleIds
    const kind = choiceType === 'text' ? 'option' : 'person'
    const choices: string[] = []
    if (!Array.isArray(raw.choices) || raw.choices.length < 2) {
      p.reject('choices-missing', `${at}.choices`, 'A recall step needs at least two choices.')
    } else {
      raw.choices.forEach((c: unknown, i: number) => {
        const id = str(c)
        if (!id) {
          p.reject('choice-malformed', `${at}.choices[${i}]`, `Each choice must be a ${kind} id.`)
          return
        }
        if (!known.has(id)) {
          // §4.2 — a choice with nothing behind it cannot be rendered at all.
          p.reject(
            choiceType === 'text' ? 'choice-unknown-option' : 'choice-unknown-person',
            `${at}.choices[${i}]`,
            `No ${kind} with id "${id}" in this ${choiceType === 'text' ? 'question' : 'pack'}.`
          )
          return
        }
        if (choices.includes(id)) {
          p.reject('choice-duplicate', `${at}.choices[${i}]`, `"${id}" appears twice in the choices.`)
          return
        }
        choices.push(id)
      })
    }

    // An option nobody can pick is dead weight in a caregiver's file, not a fault that
    // stops the level running.
    for (const option of options) {
      if (!choices.includes(option.id)) {
        p.warn(
          'option-unused',
          `${at}.options`,
          `Option "${option.id}" is never offered as a choice; it will not be shown.`
        )
      }
    }

    if (!answer) p.reject('answer-missing', `${at}.answer`, 'A recall step needs an answer.')
    else if (choices.length > 0 && !choices.includes(answer)) {
      // §4.2's first rejection row. Also caught when the answer names nobody at all.
      p.reject(
        'answer-not-in-choices',
        `${at}.answer`,
        `The answer "${answer}" is not one of the choices (${choices.join(', ')}).`
      )
    }

    // §4.2's last row is a warning, not a rejection: a reducedChoices that has lost the
    // answer is ignored and the runner reduces deterministically instead.
    let reducedChoices: string[] | undefined
    if (raw.reducedChoices !== undefined) {
      if (!Array.isArray(raw.reducedChoices)) {
        p.warn('reduced-malformed', `${at}.reducedChoices`, 'reducedChoices must be an array; ignoring it.')
      } else {
        const reduced = raw.reducedChoices.map((c: unknown) => str(c)).filter((c): c is string => c !== null)
        const strays = reduced.filter((id) => !choices.includes(id))
        if (answer && !reduced.includes(answer)) {
          p.warn(
            'reduced-without-answer',
            `${at}.reducedChoices`,
            'reducedChoices does not contain the answer; ignoring it and reducing deterministically.'
          )
        } else if (strays.length > 0) {
          p.warn(
            'reduced-stray-choice',
            `${at}.reducedChoices`,
            `reducedChoices names ${strays.join(', ')}, which are not choices; ignoring it.`
          )
        } else if (reduced.length < 2) {
          p.warn('reduced-too-short', `${at}.reducedChoices`, 'reducedChoices needs at least two entries; ignoring it.')
        } else {
          reducedChoices = reduced
        }
      }
    }

    // A recall step's `highlight` is the level-2 mode, not a world id: §4.1's own
    // example uses the sentinel "reduce". Anything else is read as a world hint target
    // so a pack cannot quietly point at scenery that does not exist.
    if (highlight && highlight !== REDUCE_SENTINEL) checkHighlight()

    if (!question || !answer || !hints || choices.length < 2 || !choices.includes(answer)) return null
    if (choiceType === 'text' && options.length < 2) return null
    return {
      type: 'recall',
      memory: isObject(raw.memory) ? { photo: str(raw.memory.photo) ?? undefined, caption: str(raw.memory.caption) ?? '' } : undefined,
      question,
      choiceType,
      choices,
      options: choiceType === 'text' ? options : undefined,
      answer,
      reducedChoices,
      hints
    }
  }

  p.reject('step-type-unknown', `${at}.type`, `Unknown step type "${type ?? '(missing)'}" — expected navigate, find or recall.`)
  return null
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type CardStyle = 'photo' | 'text'

/**
 * Everything the runner and the UI need to know about what actually loaded. Built once,
 * after validation; nothing here can reject a pack.
 */
export class PackMedia {
  private photos = new Map<string, string>()
  private voices = new Map<string, AudioBuffer>()
  private styles = new Map<string, CardStyle>()
  readonly crops = new Map<string, Crop>()
  resolver?: MediaResolver
  readonly anchorTextures = new Map<string, THREE.Texture>()

  /** A usable, already-decoded photo URL for this person, or null. */
  photoFor(personId: string): string | null {
    return this.photos.get(personId) ?? null
  }

  voiceFor(personId: string): AudioBuffer | null {
    return this.voices.get(personId) ?? null
  }

  /** §4.2: photo cards only if *every* choice in the question has a photo. */
  cardStyle(missionId: string, stepIndex: number): CardStyle {
    return this.styles.get(`${missionId}#${stepIndex}`) ?? 'text'
  }

  /** @internal — filled by `loadMedia`. */
  setPhoto(personId: string, url: string): void {
    this.photos.set(personId, url)
  }

  /** @internal */
  setVoice(personId: string, buffer: AudioBuffer): void {
    this.voices.set(personId, buffer)
  }

  /** @internal */
  setStyle(missionId: string, stepIndex: number, style: CardStyle): void {
    this.styles.set(`${missionId}#${stepIndex}`, style)
  }

  dispose(): void {
    for (const texture of this.anchorTextures.values()) texture.dispose()
    this.anchorTextures.clear()
    this.photos.clear()
    this.voices.clear()
    this.styles.clear()
    this.crops.clear()
    this.resolver?.dispose()
  }
}

/** Resolves once the browser has decoded the image, or rejects. Never throws. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function loadTexture(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        resolve(texture)
      },
      undefined,
      () => resolve(null)
    )
  })
}

function loadAudio(url: string): Promise<AudioBuffer | null> {
  return new Promise((resolve) => {
    new THREE.AudioLoader().load(
      url,
      (buffer) => resolve(buffer),
      undefined,
      () => resolve(null)
    )
  })
}

/**
 * §4.2's "neutral placeholder texture". A frame with a missing photo shows blank paper,
 * not a magenta checker and not a hole — the patient sees an empty frame, which is a
 * thing that exists in houses, and the caregiver sees the warning in the console.
 */
function placeholderTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, '#cdc4b8')
  gradient.addColorStop(1, '#b3a899')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export interface MediaOptions {
  resolver?: MediaResolver
  anisotropy?: number
  /** `?break=` tokens — see `breakagesFromLocation`. */
  breakages?: Set<string>
  /** Reports item counts to the loading screen. Never bytes — see ui.ts `LoadStage`. */
  onProgress?: StageProgress
}

/**
 * Loads every file the pack names, in parallel, and decides each recall question's card
 * style. Media failure is never fatal: the returned problems are all warnings.
 */
export async function loadMedia(
  pack: MemoryPack,
  options: MediaOptions = {}
): Promise<{ media: PackMedia; problems: PackProblem[] }> {
  const broken = options.breakages ?? new Set<string>()
  const media = new PackMedia()
  const resolver = options.resolver ?? new MediaResolver()
  media.resolver = resolver
  const problems: PackProblem[] = []

  // The denominator is every file this pack names — anchors, photos and voices. It is
  // known exactly, before a single request goes out, because validation has already run.
  let done = 0
  let failed = 0
  let total = 0
  const settled = (okFlag: boolean): void => {
    if (okFlag) done++
    else failed++
    options.onProgress?.('media', done, failed, total)
  }

  /** Rewrites a path to one that cannot resolve, so the real failure path runs. */
  const path = (token: string, raw: string): string =>
    broken.has(token) ? resolvePackPath(`${raw}.__missing__`) : resolver.resolve(raw)

  const jobs: Promise<void>[] = []

  // --- anchors: decorative, warn and continue --------------------------------
  for (const [anchorId, raw] of Object.entries(pack.anchors)) {
    jobs.push(
      loadTexture(path(`anchor:${anchorId}`, raw)).then((texture) => {
        settled(texture !== null)
        if (texture) {
          texture.anisotropy = options.anisotropy ?? 1
          texture.generateMipmaps = true
          texture.minFilter = THREE.LinearMipmapLinearFilter
          const crop = resolver.crop(raw)
          if (crop) media.crops.set(anchorId, crop)
          media.anchorTextures.set(anchorId, texture)
          return
        }
        media.anchorTextures.set(anchorId, placeholderTexture())
        problems.push({
          severity: 'warn',
          code: 'anchor-photo-failed',
          where: `anchors.${anchorId}`,
          message: `Could not load "${raw}"; showing a neutral placeholder.`
        })
      })
    )
  }

  // --- people: photos and voices ---------------------------------------------
  for (const person of pack.people) {
    if (person.photo) {
      jobs.push(
        (broken.has(`photo:${person.id}`) ? Promise.resolve(path(`photo:${person.id}`, person.photo)) : resolver.portrait(person.photo)).then(loadImage).then((img) => {
          settled(img !== null)
          if (img) {
            media.setPhoto(person.id, img.src)
            return
          }
          problems.push({
            severity: 'warn',
            code: 'person-photo-failed',
            where: `people.${person.id}.photo`,
            message: `Could not load "${person.photo}"; any question using ${person.name} becomes text-only.`
          })
        })
      )
    }
    if (person.voice) {
      jobs.push(
        loadAudio(path(`voice:${person.id}`, person.voice)).then((buffer) => {
          settled(buffer !== null)
          if (buffer) {
            media.setVoice(person.id, buffer)
            return
          }
          // §4.2: "Voice/audio file missing → silent, continue."
          problems.push({
            severity: 'warn',
            code: 'voice-failed',
            where: `people.${person.id}.voice`,
            message: `Could not load "${person.voice}"; ${person.name}'s card will be silent.`
          })
        })
      )
    }
  }

  total = jobs.length
  options.onProgress?.('media', 0, 0, total)
  await Promise.all(jobs)
  options.onProgress?.('media', done, failed, total)

  // --- card style, per question, after every photo has settled ---------------
  for (const mission of pack.missions) {
    mission.steps.forEach((step, index) => {
      if (step.type !== 'recall') return
      const recall = step as RecallStep
      // A text question has no portraits to lose, so there is no decision to take and
      // nothing to warn about: its cards were always going to be text.
      if (recall.choiceType === 'text') {
        media.setStyle(mission.id, index, 'text')
        return
      }
      // Over the *full* choice list, not the reduced one: level 2 swaps the list mid
      // question, and the card style must not change underneath the player.
      const everyPhotoLoaded = recall.choices.every((id) => media.photoFor(id) !== null)
      media.setStyle(mission.id, index, everyPhotoLoaded ? 'photo' : 'text')
      if (!everyPhotoLoaded && recall.choices.some((id) => media.photoFor(id) !== null)) {
        problems.push({
          severity: 'warn',
          code: 'question-text-only',
          where: `missions.${mission.id}.steps[${index}]`,
          message:
            'At least one choice photo is missing, so every choice in this question is ' +
            'shown as a text card — a lone text card would identify the answer.'
        })
      }
    })
  }

  return { media, problems }
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

/** The picture surface inside a frame anchor, if it has one. */
function plateOf(anchor: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null
  anchor.traverse((node) => {
    if (!found && node.name === ANCHOR_PLATE && (node as THREE.Mesh).isMesh) found = node as THREE.Mesh
  })
  return found
}

/**
 * Cover-crops a square photo into a frame of a different aspect, so a portrait is not
 * squashed sideways into a landscape frame.
 */
function fitToPlate(texture: THREE.Texture, plate: THREE.Mesh, crop: Crop = { x: .5, y: .5, zoom: 1 }): void {
  const params = (plate.geometry as THREE.PlaneGeometry).parameters
  const image = texture.image as { width?: number; height?: number } | undefined
  if (!params || !image?.width || !image?.height) return
  const frame = params.width / params.height
  const [x, y, w, h] = cropRect(image.width, image.height, frame, crop)
  texture.repeat.set(w / image.width, h / image.height)
  texture.offset.set(x / image.width, 1 - (y + h) / image.height)
}

/**
 * Hangs the pack's photos in the world's frame anchors. Both anchors this world
 * provides — `livingRoomWall` and `bedsideFrame` — are picture frames, so "anchor
 * textures" and "framed photos" are one injection here; an anchor that is not a frame
 * is skipped with a warning rather than silently ignored.
 */
export function injectAnchors(world: WorldSource, media: PackMedia): PackProblem[] {
  const problems: PackProblem[] = []
  for (const [anchorId, texture] of media.anchorTextures) {
    const anchor = world.anchors[anchorId]
    if (!anchor) continue // validation already rejected this; defensive only
    const plate = plateOf(anchor)
    if (!plate) {
      problems.push({
        severity: 'warn',
        code: 'anchor-not-a-frame',
        where: `anchors.${anchorId}`,
        message: `Anchor "${anchorId}" has no picture surface in this world; its photo is not shown.`
      })
      continue
    }
    fitToPlate(texture, plate, media.crops.get(anchorId))
    // The plate's material is its own instance (built per frame), so this needs no
    // clone — §5.3's rule is about *shared* materials.
    // Unlit, colour-managed photo paper avoids scene glare and darkening.
    const old = plate.material as THREE.Material
    plate.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    old.dispose()
  }
  return problems
}

/**
 * Positional voice playback, mounted on the world's `audioSource` anchor (§1).
 *
 * The distance model is deliberately gentle. The radio stands in the living room and a
 * recall question is usually answered in the kitchen, several metres and a wall away;
 * §6's Checkpoint C gate is an *audible* voice, so the falloff is tuned to keep the
 * voice clearly audible anywhere in the house while still arriving from a direction.
 */
export class PackVoices {
  private audio: THREE.PositionalAudio
  private media: PackMedia | null = null

  constructor(listener: THREE.AudioListener, mount: THREE.Object3D) {
    this.audio = new THREE.PositionalAudio(listener)
    this.audio.setDistanceModel('linear')
    this.audio.setRefDistance(4)
    this.audio.setMaxDistance(40)
    this.audio.setRolloffFactor(0.4)
    this.audio.setVolume(1)
    mount.add(this.audio)
  }

  use(media: PackMedia): void {
    this.media = media
  }

  /** Browsers start the AudioContext suspended; call this from a user gesture. */
  unlock(): void {
    const context = this.audio.context
    if (context.state === 'suspended') void context.resume().catch(() => {})
  }

  /** Returns true if a voice actually started. Missing voice → silent, per §4.2. */
  play(personId: string): boolean {
    const buffer = this.media?.voiceFor(personId)
    if (!buffer) return false
    this.stop()
    this.audio.setBuffer(buffer)
    try {
      this.audio.play()
      return true
    } catch {
      return false
    }
  }

  /** §5.6 resets audio playback. */
  stop(): void {
    try {
      if (this.audio.isPlaying) this.audio.stop()
    } catch {
      /* stopping something that never started is not an error worth surfacing */
    }
  }
}

// ---------------------------------------------------------------------------
// The load
// ---------------------------------------------------------------------------

export interface LoadedPack {
  patientId: string
  pack: MemoryPack
  media: PackMedia
  /** Warnings only — anything fatal was thrown as `PackRejected`. */
  problems: PackProblem[]
}

export interface LoadOptions extends MediaOptions {
  /** Defaults to `packs/<patientId>/pack.json`, resolved against the document base. */
  url?: string
}

/**
 * Fetch → validate → load media. Throws `PackRejected`, carrying *every* problem found,
 * if the pack cannot be run; returns warnings otherwise.
 */
export async function loadPack(
  patientId: string,
  world: WorldSource,
  options: LoadOptions = {}
): Promise<LoadedPack> {
  if (!PATIENT_ID.test(patientId)) {
    throw new PackRejected(patientId, [
      {
        severity: 'reject',
        code: 'patient-id-invalid',
        where: '?patient=',
        message: `"${patientId}" is not a valid patient id — lowercase letters, digits and hyphens only.`
      }
    ])
  }

  const url = options.url ?? resolvePackPath(`packs/${patientId}/pack.json`)

  options.onProgress?.('pack', 0, 0, 1)

  let raw: unknown
  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      throw new PackRejected(patientId, [
        {
          severity: 'reject',
          code: 'pack-not-found',
          where: url,
          message: `The server answered ${response.status} ${response.statusText}.`
        }
      ])
    }
    raw = await response.json()
    options.onProgress?.('pack', 1, 0, 1)
  } catch (error) {
    if (error instanceof PackRejected) throw error
    throw new PackRejected(patientId, [
      {
        severity: 'reject',
        code: 'pack-unreadable',
        where: url,
        message: `Could not read the pack: ${error instanceof Error ? error.message : String(error)}`
      }
    ])
  }

  const { pack, problems } = validate(raw, world)
  if (!pack) throw new PackRejected(patientId, problems)

  const { media, problems: mediaProblems } = await loadMedia(pack, options)
  return { patientId, pack, media, problems: [...problems, ...mediaProblems] }
}
