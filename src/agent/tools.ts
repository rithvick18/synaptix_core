/**
 * §10.2 tool contracts — Checkpoint F1.
 *
 * Two families only: read tools (no side effects) and proposal tools (each returns a
 * proposal, applies nothing). `commitProposal` and `rejectProposal` are UI-only per
 * §10.2 "Not a tool" and must never appear in `AGENT_TOOL_SCHEMA` — a model cannot reach
 * them, directly or indirectly.
 *
 * No provider is wired here. This file only defines the shapes a model may fill in and
 * the pure functions that turn a filled-in call into a typed proposal.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export interface NormalisedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface StepHints {
  repeat: string
  highlight: string
  guide: string
}

export type AssetKind = 'image' | 'audio' | 'text'
export type AnchorContentType = 'portrait' | 'wall' | 'audio'

export interface AssetSummary {
  id: string
  kind: AssetKind
  width?: number
  height?: number
}

export interface AnchorSummary {
  id: string
  contentType: AnchorContentType
  aspect: number
}

// ---------------------------------------------------------------------------
// Proposals — the only things a tool call may produce
// ---------------------------------------------------------------------------

export interface PhotoPlacementProposal {
  kind: 'photo_placement'
  proposalId: string
  assetId: string
  anchorId: string
  crop: NormalisedRect
  rationale: string
}

export interface PersonProposal {
  kind: 'person'
  proposalId: string
  name: string
  relationship: string
  photoAssetId: string
  voiceAssetId?: string
}

export interface NavigateStepProposal {
  kind: 'navigate_step'
  proposalId: string
  targetRoom: string
  instruction: string
  hints: StepHints
}

export interface FindStepProposal {
  kind: 'find_step'
  proposalId: string
  targetObject: string
  instruction: string
  hints: StepHints
}

export type ChoiceType = 'person' | 'text'

export interface RecallStepProposal {
  kind: 'recall_step'
  proposalId: string
  question: string
  choiceType?: ChoiceType
  choices: string[]
  answer: string
  reducedChoices: string[]
  hints: StepHints
}

export interface LevelProposal {
  kind: 'level'
  proposalId: string
  title: string
  stepProposalIds: string[]
}

export interface CaregiverInputRequest {
  kind: 'caregiver_input_request'
  proposalId: string
  field: string
  why: string
}

export type Proposal =
  | PhotoPlacementProposal
  | PersonProposal
  | NavigateStepProposal
  | FindStepProposal
  | RecallStepProposal
  | LevelProposal

export type ToolResult = Proposal | CaregiverInputRequest

// ---------------------------------------------------------------------------
// Read tools — safe, no side effects
// ---------------------------------------------------------------------------

export interface ReadContext {
  rooms: string[]
  anchors: AnchorSummary[]
  interactables: string[]
  assets: AssetSummary[]
  caregiverText: string
  packDraft: unknown
}

export function list_rooms(ctx: ReadContext): string[] {
  return ctx.rooms
}

export function list_anchors(ctx: ReadContext): AnchorSummary[] {
  return ctx.anchors
}

export function list_interactables(ctx: ReadContext): string[] {
  return ctx.interactables
}

export function list_assets(ctx: ReadContext): AssetSummary[] {
  return ctx.assets
}

export function get_caregiver_text(ctx: ReadContext): string {
  return ctx.caregiverText
}

export function get_pack_draft(ctx: ReadContext): unknown {
  return ctx.packDraft
}

// ---------------------------------------------------------------------------
// Proposal tools — pure constructors, no persistence, no application
// ---------------------------------------------------------------------------

let counter = 0

/** Deterministic-enough id generator for a single agent run. Not a UUID: proposals are
 *  transient until `commitProposal` (UI-only, §10.2) assigns a stable pack id. */
function nextProposalId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/** Resets the local id counter. Call between test runs so fixtures get stable ids. */
export function resetProposalIds(): void {
  counter = 0
}

export function propose_photo_placement(args: {
  assetId: string
  anchorId: string
  crop: NormalisedRect
  rationale: string
}): PhotoPlacementProposal {
  return { kind: 'photo_placement', proposalId: nextProposalId('photo'), ...args }
}

export function propose_person(args: {
  name: string
  relationship: string
  photoAssetId: string
  voiceAssetId?: string
}): PersonProposal {
  return { kind: 'person', proposalId: nextProposalId('person'), ...args }
}

export function propose_navigate_step(args: {
  targetRoom: string
  instruction: string
  hints: StepHints
}): NavigateStepProposal {
  return { kind: 'navigate_step', proposalId: nextProposalId('navigate'), ...args }
}

export function propose_find_step(args: {
  targetObject: string
  instruction: string
  hints: StepHints
}): FindStepProposal {
  return { kind: 'find_step', proposalId: nextProposalId('find'), ...args }
}

export function propose_recall_step(args: {
  question: string
  choiceType?: ChoiceType
  choices: string[]
  answer: string
  reducedChoices: string[]
  hints: StepHints
}): RecallStepProposal {
  return { kind: 'recall_step', proposalId: nextProposalId('recall'), ...args }
}

export function propose_level(args: { title: string; stepProposalIds: string[] }): LevelProposal {
  return { kind: 'level', proposalId: nextProposalId('level'), ...args }
}

/** The escape hatch (§10.2). A well-behaved run calls this often — it is not a failure
 *  mode, it is the model declining to guess. */
export function request_caregiver_input(args: { field: string; why: string }): CaregiverInputRequest {
  return { kind: 'caregiver_input_request', proposalId: nextProposalId('ask'), ...args }
}

// ---------------------------------------------------------------------------
// Function-calling schema — what is actually handed to a model
// ---------------------------------------------------------------------------

export interface JsonSchemaTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

const rect: Record<string, unknown> = {
  type: 'object',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' }
  },
  required: ['x', 'y', 'width', 'height'],
  additionalProperties: false
}

const hints: Record<string, unknown> = {
  type: 'object',
  properties: {
    repeat: { type: 'string' },
    highlight: { type: 'string' },
    guide: { type: 'string' }
  },
  required: ['repeat', 'highlight', 'guide'],
  additionalProperties: false
}

/**
 * Exactly the tools §10.2 names as reachable by a model. `commitProposal` and
 * `rejectProposal` are UI-only (§10.2 "Not a tool") and are deliberately absent —
 * this array is what a caller hands to a provider's function-calling API, so their
 * absence here is the actual enforcement, not a comment promising it elsewhere.
 */
export const AGENT_TOOL_SCHEMA: JsonSchemaTool[] = [
  {
    name: 'list_rooms',
    description: 'Returns room ids in the active world.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_anchors',
    description: 'Returns anchor ids, accepted content type and aspect ratio.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_interactables',
    description: 'Returns interactable ids available as find targets.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_assets',
    description: 'Returns uploaded asset ids, kind and dimensions. Never content.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_caregiver_text',
    description: "Returns the caregiver's typed notes, verbatim.",
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_pack_draft',
    description: 'Returns the draft pack as it currently stands.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'propose_photo_placement',
    description:
      "Proposes placing an uploaded image on an anchor. The anchor must accept the image's shape: an upright photograph on a portrait anchor, a wide one on a wall anchor. `crop` is a rectangle in fractions of the image. Applies nothing.",
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        anchorId: { type: 'string' },
        crop: rect,
        rationale: { type: 'string' }
      },
      required: ['assetId', 'anchorId', 'crop', 'rationale'],
      additionalProperties: false
    }
  },
  {
    name: 'propose_person',
    description:
      'Proposes an entry in people[]. The name must be one the caregiver typed — a face in a photograph is never a name. Applies nothing.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        relationship: { type: 'string' },
        photoAssetId: { type: 'string' },
        voiceAssetId: { type: 'string' }
      },
      required: ['name', 'relationship', 'photoAssetId'],
      additionalProperties: false
    }
  },
  {
    name: 'propose_navigate_step',
    description:
      'Proposes a navigate step. `targetRoom` is a room id the world already has, and `hints.highlight` is usually the door or arch leading there rather than the room itself. Applies nothing.',
    parameters: {
      type: 'object',
      properties: {
        targetRoom: { type: 'string' },
        instruction: { type: 'string' },
        hints
      },
      required: ['targetRoom', 'instruction', 'hints'],
      additionalProperties: false
    }
  },
  {
    name: 'propose_find_step',
    description:
      'Proposes a find step. `targetObject` is an interactable id the world already has, and `hints.highlight` is normally that same id. Applies nothing.',
    parameters: {
      type: 'object',
      properties: {
        targetObject: { type: 'string' },
        instruction: { type: 'string' },
        hints
      },
      required: ['targetObject', 'instruction', 'hints'],
      additionalProperties: false
    }
  },
  {
    name: 'propose_recall_step',
    description:
      'Proposes a recall step. `answer` must appear word for word in `choices`; `reducedChoices` must be a shorter subset of `choices` that still contains `answer`; `hints.highlight` must be the word `reduce`. Applies nothing.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        choiceType: { type: 'string', enum: ['person', 'text'] },
        choices: { type: 'array', items: { type: 'string' } },
        answer: { type: 'string' },
        reducedChoices: { type: 'array', items: { type: 'string' } },
        hints
      },
      required: ['question', 'choices', 'answer', 'reducedChoices', 'hints'],
      additionalProperties: false
    }
  },
  {
    name: 'propose_level',
    description: 'Assembles proposed steps into a level, in play order, by their proposal ids. Applies nothing.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        stepProposalIds: { type: 'array', items: { type: 'string' } }
      },
      required: ['title', 'stepProposalIds'],
      additionalProperties: false
    }
  },
  {
    name: 'request_caregiver_input',
    description:
      'The escape hatch: ask for any fact you were not given rather than guessing it. Calling this is a success, not a failure — a run that asks nothing about a thin upload has invented something instead.',
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string' },
        why: { type: 'string' }
      },
      required: ['field', 'why'],
      additionalProperties: false
    }
  }
]
