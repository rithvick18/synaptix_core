/**
 * §10.3 — the content firewall. Pure, synchronous, no imports beyond types (and the
 * caregiver-token builder is deliberately its own module for the same reason: nothing
 * here fetches, renders or calls a model). Runs when a proposal is created **and again**
 * inside `commitProposal` — this module is that function, called from both places.
 */
import type {
  AnchorContentType,
  AssetKind,
  Proposal,
  StepHints
} from './tools'

// ---------------------------------------------------------------------------
// Context and result shapes
// ---------------------------------------------------------------------------

export interface WorldRegistry {
  rooms: Set<string>
  interactables: Set<string>
  /** Ids a `hints.highlight` may name — interactables plus door/arch hint targets
   *  (§1's `kitchenDoor`, `livingArch`, etc). Kept separate from `interactables`
   *  because a hint target need not be a find target and vice versa. */
  hintTargets: Set<string>
  anchors: Map<string, { contentType: AnchorContentType; aspect: number }>
}

export interface AssetRegistry {
  id: string
  kind: AssetKind
  /** width / height. > 1 is landscape, < 1 is portrait, 1 is square. */
  aspect?: number
}

export interface FirewallContext {
  allowedTokens: Set<string>
  world: WorldRegistry
  assets: Map<string, AssetRegistry>
  /** Known person ids — proposed or already in the pack — for §4.1 choice membership. */
  people: Set<string>
}

export interface Violation {
  rule: string
  token: string
  message: string
}

export interface FirewallResult {
  ok: boolean
  violations: Violation[]
}

// ---------------------------------------------------------------------------
// F-a / F-b / F-c — text checked against the caregiver's own words
// ---------------------------------------------------------------------------

/** Function words that are capitalised only by sentence position, never a fact. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could',
  'would', 'will', 'who', 'what', 'when', 'where', 'why', 'how', 'please', 'you', 'your',
  'it', 'this', 'that', 'yes', 'no', 'and', 'or', 'but', 'to', 'in', 'on', 'at', 'of',
  'for', 'with', 'go', 'find', 'it\'s'
])

const MONTHS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december'
])

/** A small, deterministic gazetteer. F-c is a demonstrable structural check, not an
 *  exhaustive place-name detector — a real one is out of scope for a pure function. */
const KNOWN_PLACE_WORDS = new Set([
  'guwahati', 'assam', 'delhi', 'mumbai', 'kolkata', 'bangalore', 'chennai', 'shillong',
  'kerala', 'india', 'kaziranga', 'jorhat', 'dibrugarh', 'tezpur'
])

function sentenceInitialWords(text: string): Set<string> {
  const initial = new Set<string>()
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const first = sentence.trim().split(/\s+/)[0]
    if (first) initial.add(first.replace(/[^\p{L}\p{N}']/gu, ''))
  }
  return initial
}

function checkTokensAgainstAllowlist(
  field: string,
  text: string,
  ctx: FirewallContext,
  violations: Violation[],
  /**
   * Set for fields whose entire value is a proper noun — a person's name. The
   * sentence-initial exemption below exists so that "Please go to the kitchen." does not
   * report "Please"; in a name field there is no sentence, and position one is exactly
   * where an invented name lands. Without this, a model proposing a bare `"Devika"`
   * passes F-a because the only word present is also the first one — which is precisely
   * the failure a small local model produces most often.
   */
  treatWholeFieldAsProperNoun = false
): void {
  const sentenceStarts = treatWholeFieldAsProperNoun ? new Set<string>() : sentenceInitialWords(text)
  const words = text.match(/[\p{L}][\p{L}\p{N}']*/gu) ?? []

  // F-a: capitalised words / proper nouns not in allowedTokens.
  for (const word of words) {
    if (!/^[A-Z]/.test(word)) continue
    if (sentenceStarts.has(word)) continue
    if (STOPWORDS.has(word.toLowerCase())) continue
    if (ctx.allowedTokens.has(word)) continue
    violations.push({
      rule: 'F-a',
      token: word,
      message: `${field} names "${word}", which the caregiver never supplied`
    })
  }

  // F-b: four-digit years, and month names, not in allowedTokens.
  for (const match of text.matchAll(/\b(19|20)\d{2}\b/g)) {
    const year = match[0]
    if (!ctx.allowedTokens.has(year)) {
      violations.push({
        rule: 'F-b',
        token: year,
        message: `${field} invents the year "${year}", which the caregiver never supplied`
      })
    }
  }
  for (const word of words) {
    if (MONTHS.has(word.toLowerCase()) && !ctx.allowedTokens.has(word)) {
      violations.push({
        rule: 'F-b',
        token: word,
        message: `${field} invents the month "${word}", which the caregiver never supplied`
      })
    }
  }

  // F-c: known place names not in allowedTokens.
  for (const word of words) {
    if (KNOWN_PLACE_WORDS.has(word.toLowerCase()) && !ctx.allowedTokens.has(word)) {
      violations.push({
        rule: 'F-c',
        token: word,
        message: `${field} names the place "${word}", which the caregiver never supplied`
      })
    }
  }
}

// ---------------------------------------------------------------------------
// F-h — hedged/speculative phrasing, length, emoji, punctuation
// ---------------------------------------------------------------------------

const HEDGE_PHRASES = ['i think', 'probably', 'likely', 'may have', 'perhaps', 'maybe', 'i believe', 'i guess']
const MAX_TEXT_LENGTH = 220
// eslint-disable-next-line no-misleading-character-class
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

function checkHedgingAndForm(field: string, text: string, violations: Violation[]): void {
  const lower = text.toLowerCase()
  for (const phrase of HEDGE_PHRASES) {
    if (lower.includes(phrase)) {
      violations.push({
        rule: 'F-h',
        token: phrase,
        message: `${field} hedges with "${phrase}" — nothing speculative reaches a patient`
      })
    }
  }

  const emojiMatch = text.match(EMOJI_PATTERN)
  if (emojiMatch) {
    violations.push({
      rule: 'F-h',
      token: emojiMatch[0],
      message: `${field} contains an emoji`
    })
  }

  const questionMarks = (text.match(/\?/g) ?? []).length
  if (questionMarks > 1) {
    violations.push({
      rule: 'F-h',
      token: '??',
      message: `${field} has more than one question mark`
    })
  }

  if (text.length > MAX_TEXT_LENGTH) {
    violations.push({
      rule: 'F-h',
      token: `${text.length} chars`,
      message: `${field} exceeds the ${MAX_TEXT_LENGTH}-character cap`
    })
  }
}

// ---------------------------------------------------------------------------
// F-i — clinical / diagnostic vocabulary
// ---------------------------------------------------------------------------

const CLINICAL_DENYLIST = [
  'dementia', 'alzheimer', 'memory loss', 'decline', 'impairment', 'patient', 'diagnosis',
  'symptom', 'test', 'score'
]

function checkClinicalVocabulary(field: string, text: string, violations: Violation[]): void {
  const lower = text.toLowerCase()
  for (const term of CLINICAL_DENYLIST) {
    const re = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i')
    if (re.test(lower)) {
      violations.push({
        rule: 'F-i',
        token: term,
        message: `${field} uses clinical vocabulary ("${term}"), which addresses the player as a subject`
      })
    }
  }
}

/** Runs F-a, F-b, F-c, F-h and F-i against one patient-facing string. */
function checkText(field: string, text: string, ctx: FirewallContext, violations: Violation[]): void {
  checkTokensAgainstAllowlist(field, text, ctx, violations)
  checkHedgingAndForm(field, text, violations)
  checkClinicalVocabulary(field, text, violations)
}

/** `hints.highlight` is an id (or the `reduce` sentinel), never patient-facing prose —
 *  only `repeat` and `guide` carry text a patient reads or hears. */
function checkHints(ctx: FirewallContext, hints: StepHints, violations: Violation[]): void {
  checkText('hints.repeat', hints.repeat, ctx, violations)
  checkText('hints.guide', hints.guide, ctx, violations)
}

// ---------------------------------------------------------------------------
// F-f — world ids
// ---------------------------------------------------------------------------

function checkHighlightTarget(ctx: FirewallContext, highlight: string, violations: Violation[]): void {
  if (highlight === 'reduce') return
  if (ctx.world.hintTargets.has(highlight)) return
  violations.push({
    rule: 'F-f',
    token: highlight,
    message: `hints.highlight "${highlight}" is not a hint target the world provides`
  })
}

// ---------------------------------------------------------------------------
// The rules, dispatched per proposal kind
// ---------------------------------------------------------------------------

export function validateProposal(p: Proposal, ctx: FirewallContext): FirewallResult {
  const violations: Violation[] = []

  switch (p.kind) {
    case 'photo_placement': {
      const anchor = ctx.world.anchors.get(p.anchorId)
      if (!anchor) {
        violations.push({
          rule: 'F-f',
          token: p.anchorId,
          message: `anchorId "${p.anchorId}" does not exist in the world registry`
        })
        break
      }
      const asset = ctx.assets.get(p.assetId)
      if (asset && asset.kind !== 'image') {
        violations.push({
          rule: 'F-g',
          token: p.assetId,
          message: `asset "${p.assetId}" is not an image and cannot fill anchor "${p.anchorId}"`
        })
      } else if (asset && asset.aspect !== undefined) {
        const assetOrientation = asset.aspect > 1 ? 'landscape' : asset.aspect < 1 ? 'portrait' : 'square'
        const anchorOrientation = anchor.aspect > 1 ? 'landscape' : anchor.aspect < 1 ? 'portrait' : 'square'
        if (
          anchor.contentType === 'portrait' &&
          assetOrientation === 'landscape' &&
          anchorOrientation !== assetOrientation
        ) {
          violations.push({
            rule: 'F-g',
            token: p.assetId,
            message: `asset "${p.assetId}" is landscape but anchor "${p.anchorId}" is a portrait frame`
          })
        } else if (
          anchor.contentType === 'wall' &&
          assetOrientation === 'portrait' &&
          anchorOrientation !== assetOrientation
        ) {
          violations.push({
            rule: 'F-g',
            token: p.assetId,
            message: `asset "${p.assetId}" is portrait but anchor "${p.anchorId}" expects a wall/landscape image`
          })
        }
      }
      break
    }

    case 'person': {
      checkTokensAgainstAllowlist('person.name', p.name, ctx, violations, true)
      // `relationship` is a common noun — "granddaughter", "neighbour" — so it keeps the
      // ordinary sentence handling; capitalising it is a typo, not a claimed fact.
      checkTokensAgainstAllowlist('person.relationship', p.relationship, ctx, violations)
      break
    }

    case 'navigate_step': {
      checkText('instruction', p.instruction, ctx, violations)
      checkHints(ctx, p.hints, violations)
      if (!ctx.world.rooms.has(p.targetRoom)) {
        violations.push({
          rule: 'F-f',
          token: p.targetRoom,
          message: `targetRoom "${p.targetRoom}" does not exist in the world registry`
        })
      }
      checkHighlightTarget(ctx, p.hints.highlight, violations)
      break
    }

    case 'find_step': {
      checkText('instruction', p.instruction, ctx, violations)
      checkHints(ctx, p.hints, violations)
      if (!ctx.world.interactables.has(p.targetObject)) {
        violations.push({
          rule: 'F-f',
          token: p.targetObject,
          message: `targetObject "${p.targetObject}" does not exist in the world registry`
        })
      }
      checkHighlightTarget(ctx, p.hints.highlight, violations)
      break
    }

    case 'recall_step': {
      checkText('question', p.question, ctx, violations)
      checkHints(ctx, p.hints, violations)

      // F-d: answer must be one of the choices.
      if (!p.choices.includes(p.answer)) {
        violations.push({
          rule: 'F-d',
          token: p.answer,
          message: `answer "${p.answer}" is not one of the proposed choices`
        })
      }

      // F-d: for a person question, every choice must name a known person.
      if (p.choiceType !== 'text') {
        for (const choice of p.choices) {
          if (!ctx.people.has(choice)) {
            violations.push({
              rule: 'F-d',
              token: choice,
              message: `choice "${choice}" does not name anyone in people[]`
            })
          }
        }
      }

      // F-e: reducedChoices is a subset of choices and keeps the answer.
      if (!p.reducedChoices.includes(p.answer)) {
        violations.push({
          rule: 'F-e',
          token: p.answer,
          message: 'reducedChoices drops the answer'
        })
      }
      for (const choice of p.reducedChoices) {
        if (!p.choices.includes(choice)) {
          violations.push({
            rule: 'F-e',
            token: choice,
            message: `reducedChoices names "${choice}", which is not among choices`
          })
        }
      }

      // A recall step's own highlight is always the `reduce` sentinel (§5.4), never a
      // world id — anything else is unresolvable at hint level 2.
      if (p.hints.highlight !== 'reduce') {
        violations.push({
          rule: 'F-f',
          token: p.hints.highlight,
          message: 'a recall step\'s hints.highlight must be the "reduce" sentinel'
        })
      }
      break
    }

    case 'level': {
      checkTokensAgainstAllowlist('level.title', p.title, ctx, violations)
      checkHedgingAndForm('level.title', p.title, violations)
      break
    }
  }

  return { ok: violations.length === 0, violations }
}
