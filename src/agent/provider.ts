/**
 * §10.2 / §10.9 — the provider seam, types only. No implementation and no inference
 * runtime is imported here, so the tool layer, the review UI and the checks can depend
 * on this file without pulling in whatever actually runs the model.
 *
 * Every failure path is a typed result rather than a throw, so a caller always has a
 * clear message and a fallback to manual authoring (§10.9): "never a blocked UI."
 *
 * There are two implementations, chosen by the setup mode (`config.ts`):
 * `llamaCpp.ts` for offline mode, talking to a `llama-server` on the loopback
 * interface, and `gemini.ts` for online mode, talking to Google's Gemini API. Each one
 * enforces its own destination before it opens a socket — loopback-only and
 * `generativelanguage.googleapis.com`-only respectively — so neither can be pointed
 * somewhere else by a hand-edited config.
 */

export interface ProbeImage {
  assetId: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** Base64-encoded `probe` derivative only (§10.5) — never the original. */
  base64: string
}

/**
 * One step of the reasoning a request asks for before any tool call (§10.2). The prompts
 * in `prompts.ts` own both halves of this: `instruction` is rendered into the system
 * prompt, and `key` names the field the model writes that step's answer into.
 *
 * The distinction between the two adapters matters here. Offline, the scratchpad is part
 * of the constrained-decoding schema and is emitted *before* `calls`, so the sampler
 * makes the model reason first — thinking is enforced, not requested. Online, Gemini's
 * function calling owns the response shape, so the same steps are prose in the system
 * instruction and the model is merely asked. Same prompt, two strengths of guarantee.
 */
export interface ReasoningStep {
  /** JSON property name for this step's note. Short and lower-case — it is decoded. */
  key: string
  /** What the model must work out at this step. Rendered into the system prompt. */
  instruction: string
}

export interface ProviderRequest {
  systemPrompt: string
  tools: JsonSchemaToolList
  caregiverText: string
  probeImages: ProbeImage[]
  /** Omitted or empty means "no scratchpad": the request shape is exactly what it was
   *  before reasoning steps existed, which is what keeps a caller that wants a single
   *  cheap call from paying for one. */
  reasoningSteps?: readonly ReasoningStep[]
}

export interface ProviderToolCall {
  tool: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
}

/**
 * Failure modes across both setup modes. The first group is what goes wrong locally —
 * chiefly the model server not being up — and the second is what only a hosted API can
 * do to you: reject your credential, meter you, or decline to answer. Offline mode can
 * never produce the second group, which is the point: `no-key`, `bad-key` and
 * `rate-limited` are unreachable when nothing authenticates and nothing leaves the
 * machine.
 */
export type ProviderFailureReason =
  | 'not-configured'
  | 'server-unreachable'
  | 'model-not-loaded'
  | 'timeout'
  | 'overloaded'
  | 'malformed-response'
  | 'no-key'
  | 'bad-key'
  | 'rate-limited'
  | 'blocked'
  | 'unknown'

export interface ProviderSuccess {
  ok: true
  toolCalls: ProviderToolCall[]
  model: string
  /**
   * What the model wrote for each `ReasoningStep`, keyed by `key`. Present only when the
   * adapter can actually read the reasoning back — offline, where it is a decoded field.
   *
   * It is working notes, not content: it is never committed to a pack, and deliberately
   * never written to the audit log, which §10.6 limits to the fact that a call happened.
   * Reasoning quotes the caregiver's own words back, so logging it would turn an
   * append-only record of calls into a copy of what was in them.
   */
  reasoning?: Record<string, string>
}

export interface ProviderFailure {
  ok: false
  reason: ProviderFailureReason
  message: string
}

export type ProviderResult = ProviderSuccess | ProviderFailure

export interface ProviderAdapter {
  run(request: ProviderRequest): Promise<ProviderResult>
}

/** Structural, to avoid a cycle: `tools.ts` imports nothing from here. */
export type JsonSchemaToolList = readonly {
  name: string
  description: string
  parameters: Record<string, unknown>
}[]
