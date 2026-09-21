/**
 * §10.2 / §10.9 — the provider seam, types only. No implementation and no inference
 * runtime is imported here, so the tool layer, the review UI and the checks can depend
 * on this file without pulling in whatever actually runs the model.
 *
 * Every failure path is a typed result rather than a throw, so a caller always has a
 * clear message and a fallback to manual authoring (§10.9): "never a blocked UI."
 *
 * Inference is local (§10.6): `llamaCpp.ts` is the only implementation, and it talks to
 * a `llama-server` on the loopback interface. There is no hosted-provider adapter and no
 * API key anywhere in this module graph.
 */

export interface ProbeImage {
  assetId: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** Base64-encoded `probe` derivative only (§10.5) — never the original. */
  base64: string
}

export interface ProviderRequest {
  systemPrompt: string
  tools: JsonSchemaToolList
  caregiverText: string
  probeImages: ProbeImage[]
}

export interface ProviderToolCall {
  tool: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
}

/**
 * Local-inference failure modes. There is deliberately no `no-key` or `bad-key` here:
 * nothing authenticates, because nothing leaves the machine. What replaces them is the
 * one thing that actually goes wrong locally — the model server not being up.
 */
export type ProviderFailureReason =
  | 'not-configured'
  | 'server-unreachable'
  | 'model-not-loaded'
  | 'timeout'
  | 'overloaded'
  | 'malformed-response'
  | 'unknown'

export interface ProviderSuccess {
  ok: true
  toolCalls: ProviderToolCall[]
  model: string
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
