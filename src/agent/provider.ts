/**
 * §10.2 / §10.9 — a single provider adapter behind an interface. Every failure path
 * returns a typed result rather than throwing, so a caller always has a clear message
 * and a fallback to manual authoring (§10.9): "never a blocked UI."
 *
 * Reads `apiKey` / `model` from env for local dev only (`.env`, git-ignored — see
 * `.env.example`). No key ever ships in a committed file or a production build; with
 * `agent.enabled: false` (the shipped default, §10.9) this module is never invoked.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { AGENT_TOOL_SCHEMA, JsonSchemaTool } from './tools'

export interface ProbeImage {
  assetId: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** Base64-encoded `probe` derivative only (§10.5) — never the original. */
  base64: string
}

export interface ProviderRequest {
  systemPrompt: string
  tools: typeof AGENT_TOOL_SCHEMA
  caregiverText: string
  probeImages: ProbeImage[]
}

export interface ProviderToolCall {
  tool: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
}

export type ProviderFailureReason =
  | 'no-key'
  | 'bad-key'
  | 'timeout'
  | 'malformed-response'
  | 'rate-limited'
  | 'network'
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

export interface AnthropicProviderConfig {
  apiKey?: string
  model?: string
  timeoutMs?: number
  /** Injected for tests (§F1's fixture pattern) — never used to reach a real network
   *  in `npm run check`, which passes no `fetch` and so never constructs a real client. */
  fetch?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MODEL = 'claude-opus-5'

function toAnthropicTools(tools: JsonSchemaTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema
  }))
}

function friendlyMessage(reason: ProviderFailureReason, detail: string): string {
  switch (reason) {
    case 'no-key':
      return 'No API key is configured. Continue with manual authoring, or add one to .env for local dev.'
    case 'bad-key':
      return 'The configured API key was rejected. Check .env, or continue with manual authoring.'
    case 'timeout':
      return 'The request timed out. You can retry, or continue with manual authoring.'
    case 'rate-limited':
      return 'The provider is rate-limiting requests right now. Wait a moment, or continue with manual authoring.'
    case 'malformed-response':
      return `The provider's response could not be understood (${detail}). Continue with manual authoring.`
    case 'network':
      return 'Could not reach the provider. Check your connection, or continue with manual authoring.'
    case 'unknown':
    default:
      return `Something went wrong contacting the provider (${detail}). Continue with manual authoring.`
  }
}

function classify(error: unknown): { reason: ProviderFailureReason; detail: string } {
  if (error instanceof Anthropic.AuthenticationError) return { reason: 'bad-key', detail: error.message }
  if (error instanceof Anthropic.RateLimitError) return { reason: 'rate-limited', detail: error.message }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return { reason: 'timeout', detail: error.message }
  if (error instanceof Anthropic.APIConnectionError) return { reason: 'network', detail: error.message }
  if (error instanceof Anthropic.APIError) return { reason: 'unknown', detail: `${error.status ?? '?'} ${error.message}` }
  if (error instanceof Error) return { reason: 'unknown', detail: error.message }
  return { reason: 'unknown', detail: String(error) }
}

/** Transient failures get exactly one retry (§10.9's provider adapter contract). */
function isRetryable(reason: ProviderFailureReason): boolean {
  return reason === 'timeout' || reason === 'network' || reason === 'rate-limited'
}

export class AnthropicProviderAdapter implements ProviderAdapter {
  constructor(private readonly config: AnthropicProviderConfig) {}

  async run(request: ProviderRequest): Promise<ProviderResult> {
    if (!this.config.apiKey) {
      return { ok: false, reason: 'no-key', message: friendlyMessage('no-key', '') }
    }

    const client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: 0, // this adapter owns retry policy itself (§10.9: retry-once)
      fetch: this.config.fetch
    })

    const model = this.config.model ?? DEFAULT_MODEL
    const content: Anthropic.MessageParam['content'] = [
      ...request.probeImages.map(
        (img): Anthropic.ImageBlockParam => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.base64 }
        })
      ),
      { type: 'text', text: request.caregiverText }
    ]

    const attempt = async (): Promise<ProviderResult> => {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: request.systemPrompt,
        tools: toAnthropicTools(request.tools),
        messages: [{ role: 'user', content }]
      })

      if (response.stop_reason === 'refusal') {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'the provider declined to respond') }
      }

      const toolCalls: ProviderToolCall[] = []
      for (const block of response.content) {
        if (block.type === 'tool_use') toolCalls.push({ tool: block.name, args: block.input })
      }
      if (response.stop_reason === 'tool_use' && toolCalls.length === 0) {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'no tool calls in a tool_use response') }
      }
      return { ok: true, toolCalls, model: response.model }
    }

    try {
      return await attempt()
    } catch (firstError) {
      const first = classify(firstError)
      if (!isRetryable(first.reason)) {
        return { ok: false, reason: first.reason, message: friendlyMessage(first.reason, first.detail) }
      }
      try {
        return await attempt()
      } catch (secondError) {
        const second = classify(secondError)
        return { ok: false, reason: second.reason, message: friendlyMessage(second.reason, second.detail) }
      }
    }
  }
}

/** Reads local-dev-only config from Vite's `import.meta.env` (`.env`, git-ignored). */
export function providerConfigFromEnv(env: Record<string, string | undefined>): AnthropicProviderConfig {
  return {
    apiKey: env.VITE_AGENT_API_KEY,
    model: env.VITE_AGENT_MODEL
  }
}
