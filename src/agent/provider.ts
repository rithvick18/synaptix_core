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
