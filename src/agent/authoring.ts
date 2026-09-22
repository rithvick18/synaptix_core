/**
 * §10.2 — one pack-authoring run, end to end: resolved context in, typed proposals out.
 *
 * The counterpart to `environment.ts`, and the thing that gives `prompts.ts`'s authoring
 * prompt somewhere to go. The shape follows `grammar.ts`'s conclusion about small models:
 * there is no read/propose loop. Every read tool is resolved by the caller, inlined into
 * the system prompt, and the model is handed only the tools that produce a proposal — so
 * a run is exactly one model call, and a 4B model never has to hold a conversation.
 *
 * Nothing here applies anything. The return value is `ToolResult[]`, which is what
 * `ReviewSession.ingest` takes, and every one of them still faces the firewall on arrival
 * and again at commit. The prompt is an accelerator; §10.3 is the control.
 */
import { proposalTools } from './grammar'
import { buildAuthoringSystemPrompt, AUTHORING_REASONING, type AuthoringContext } from './prompts'
import type { ProbeImage, ProviderAdapter, ProviderToolCall } from './provider'
import {
  propose_find_step,
  propose_level,
  propose_navigate_step,
  propose_person,
  propose_photo_placement,
  propose_recall_step,
  request_caregiver_input,
  resetProposalIds,
  type JsonSchemaTool,
  type ToolResult
} from './tools'

/** Why a call the model made produced no proposal. Surfaced rather than swallowed: a run
 *  that silently drops half its output looks the same as a run that was merely terse. */
export interface SkippedCall {
  tool: string
  reason: string
}

export interface AuthoringRun {
  results: ToolResult[]
  skipped: SkippedCall[]
  model: string
  /** The model's working notes, offline only — see `ProviderSuccess.reasoning`. Shown to
   *  the caregiver if a proposal needs explaining; never committed, never logged. */
  reasoning?: Record<string, string>
}

function matchesType(value: unknown, type: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
    case 'integer':
      return typeof value === 'number'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    default:
      return true
  }
}

/**
 * Checks a call's arguments against that tool's own schema before it reaches a
 * constructor.
 *
 * Offline this can never fire — the grammar already guarantees it. Online it can: Gemini's
 * function calling is a constraint on its sampler, not a promise on the wire, and a
 * proposal missing its `hints` object would otherwise reach the firewall and throw there
 * rather than being reported as the malformed call it is. Driven off `AGENT_TOOL_SCHEMA`
 * so it cannot drift from the contracts it is checking.
 */
function missingArgument(tool: JsonSchemaTool, args: unknown): string | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'arguments were not an object'
  const record = args as Record<string, unknown>
  const parameters = tool.parameters as { required?: unknown; properties?: Record<string, { type?: unknown }> }
  const required = Array.isArray(parameters.required) ? (parameters.required as string[]) : []
  for (const name of required) {
    if (!(name in record)) return `missing required argument "${name}"`
    if (!matchesType(record[name], parameters.properties?.[name]?.type)) {
      return `argument "${name}" has the wrong type`
    }
  }
  return null
}

function construct(call: ProviderToolCall): ToolResult | null {
  switch (call.tool) {
    case 'propose_photo_placement':
      return propose_photo_placement(call.args)
    case 'propose_person':
      return propose_person(call.args)
    case 'propose_navigate_step':
      return propose_navigate_step(call.args)
    case 'propose_find_step':
      return propose_find_step(call.args)
    case 'propose_recall_step':
      return propose_recall_step(call.args)
    case 'propose_level':
      return propose_level(call.args)
    case 'request_caregiver_input':
      return request_caregiver_input(call.args)
    default:
      return null
  }
}

/**
 * Turns one provider run's calls into proposals.
 *
 * `resetProposalIds()` first, so the ids are numbered from one within this run. That is
 * not tidiness: the authoring prompt promises the model that the people it proposes
 * become `person-1`, `person-2` and so on in the order it proposes them, which is how a
 * recall step can use a person invented in the same run as one of its choices (F-d checks
 * choices against known person ids). The promise is only true if the counter starts here.
 */
export function toProposals(calls: readonly ProviderToolCall[]): { results: ToolResult[]; skipped: SkippedCall[] } {
  resetProposalIds()
  const tools = new Map(proposalTools().map((t) => [t.name, t]))
  const results: ToolResult[] = []
  const skipped: SkippedCall[] = []

  for (const call of calls) {
    const tool = tools.get(call.tool)
    if (!tool) {
      skipped.push({ tool: call.tool, reason: 'not a tool this run offered' })
      continue
    }
    const problem = missingArgument(tool, call.args)
    if (problem) {
      skipped.push({ tool: call.tool, reason: problem })
      continue
    }
    const result = construct(call)
    if (result) results.push(result)
  }

  return { results, skipped }
}

/**
 * Runs one authoring pass. Throws on a provider failure, carrying the adapter's own
 * caregiver-facing message (§10.9: every failure names the fallback to manual authoring),
 * exactly as `describeEnvironment` does.
 */
export async function runAuthoringPass(
  provider: ProviderAdapter,
  context: AuthoringContext,
  images: ProbeImage[] = []
): Promise<AuthoringRun> {
  const result = await provider.run({
    systemPrompt: buildAuthoringSystemPrompt(context),
    // Only the tools that produce something: the read tools are already answered in the
    // prompt, and `commitProposal`/`rejectProposal` are not tools at all (§10.2).
    tools: proposalTools(),
    // Verbatim, and deliberately in the user message rather than folded into the system
    // prompt: it is the caregiver's own words, which is to say untrusted input that the
    // system prompt has already told the model how to treat (§10.7).
    caregiverText: context.caregiverText,
    probeImages: images,
    reasoningSteps: AUTHORING_REASONING
  })
  if (!result.ok) throw new Error(result.message)

  const { results, skipped } = toProposals(result.toolCalls)
  return { results, skipped, model: result.model, ...(result.reasoning ? { reasoning: result.reasoning } : {}) }
}
