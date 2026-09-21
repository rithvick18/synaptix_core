/**
 * §10.9 — a second provider adapter: a local model served by `llama-server`
 * (llama.cpp), reached over loopback and speaking llama.cpp's OpenAI-compatible
 * `/v1/chat/completions` endpoint.
 *
 * Why this exists alongside the hosted adapter. §10.6's privacy posture is written around
 * "only the probe derivative ever leaves the machine." With a local runtime bound to
 * 127.0.0.1 nothing leaves the machine at all — the probe crosses a loopback socket to
 * another process on the same computer and no further. That is a materially stronger
 * promise for a caregiver uploading photographs of a person with dementia, and it is the
 * reason `consentPromptFor()` in `config.ts` tells them something different in this mode
 * rather than reciting the hosted copy.
 *
 * The promise only holds while the endpoint really is loopback, so `isLoopbackEndpoint()`
 * checks rather than assumes: point this adapter at a LAN or public host and the consent
 * copy reverts to "leaves this machine."
 *
 * Model expectations. The image pipeline (§10.5) hands this adapter a JPEG, and §10.4
 * lets the model read visual properties off it, so the served model must be
 * vision-capable — a text-only GGUF cannot do this job, however large. The default target
 * is Qwen2.5-VL-3B-Instruct at Q4_K_M with its mmproj projector: ~2.2 GB of weights,
 * comfortably under the 7B ceiling, and among the better small models at holding a
 * structure. Any llama.cpp-served vision model can be substituted by config.
 *
 * Reliability at this size comes from `grammar.ts`, not from prompting: output is
 * constrained at sampling time to a valid proposal array, so "the 3B model returned
 * prose" is not a failure mode that can occur. What it *can* still do is propose things
 * that are wrong — invented names, invented years — which is the firewall's job (§10.3)
 * and is unchanged by which provider produced them.
 */
import { buildProposalGrammar, parseProposalCalls } from './grammar'
import type {
  ProbeImage,
  ProviderAdapter,
  ProviderFailureReason,
  ProviderRequest,
  ProviderResult,
  ProviderToolCall
} from './provider'

export interface LlamaCppProviderConfig {
  /** Base URL of a running `llama-server`. Default is loopback; see the note above. */
  endpoint?: string
  /** Label sent as `model`. llama-server serves whichever GGUF it was started with, so
   *  this is recorded for provenance (§10.8) more than it is a selector. */
  model?: string
  timeoutMs?: number
  temperature?: number
  maxTokens?: number
  /** Optional `--api-key` if the local server was started with one. */
  apiKey?: string
  /** Injected in tests so `npm run check` exercises every path without a live server. */
  fetch?: typeof fetch
}

export const DEFAULT_LLAMACPP_ENDPOINT = 'http://127.0.0.1:8080'
export const DEFAULT_LLAMACPP_MODEL = 'qwen2.5-vl-3b-instruct-q4_k_m'
/** A 3B Q4 model generating a few hundred tokens from an image on CPU is not fast. */
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_TOKENS = 2048
/** Low but not zero: greedy decoding under a grammar tends to repeat a single proposal. */
const DEFAULT_TEMPERATURE = 0.2

/**
 * True when the endpoint resolves to this machine. Drives the consent copy (§10.6) and
 * nothing else — this function decides what the caregiver is told, so it errs toward
 * "not loopback" for anything it cannot parse or recognise.
 */
export function isLoopbackEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!ipv4) return false
  const octets = ipv4.slice(1).map(Number)
  if (octets.some((o) => Number.isNaN(o) || o > 255)) return false
  return octets[0] === 127
}

function friendlyMessage(reason: ProviderFailureReason, detail: string): string {
  switch (reason) {
    case 'network':
      return 'Could not reach the local model server. Start llama-server, or continue writing this pack by hand.'
    case 'model-unavailable':
      return 'The local model server is running but has no model loaded to answer with. Continue writing this pack by hand.'
    case 'timeout':
      return 'The local model took too long to answer. You can retry, or continue writing this pack by hand.'
    case 'bad-key':
      return 'The local model server rejected the configured API key. Check it, or continue writing this pack by hand.'
    case 'rate-limited':
      return 'The local model server is busy with another request. Wait a moment, or continue writing this pack by hand.'
    case 'malformed-response':
      return `The local model's answer could not be read (${detail}). Continue writing this pack by hand.`
    default:
      return `Something went wrong talking to the local model (${detail}). Continue writing this pack by hand.`
  }
}

function isRetryable(reason: ProviderFailureReason): boolean {
  return reason === 'timeout' || reason === 'network' || reason === 'rate-limited'
}

function classifyStatus(status: number): ProviderFailureReason {
  if (status === 401 || status === 403) return 'bad-key'
  if (status === 404 || status === 501 || status === 503) return 'model-unavailable'
  if (status === 429) return 'rate-limited'
  return 'unknown'
}

function classifyThrown(error: unknown): { reason: ProviderFailureReason; detail: string } {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { reason: 'timeout', detail: error.message }
    }
    return { reason: 'network', detail: error.message }
  }
  return { reason: 'network', detail: String(error) }
}

/** Only the probe derivative is ever encoded into a message (§10.5 rule 4). The type
 *  makes the wrong thing unrepresentable; this function is where it becomes bytes. */
function imageContent(image: ProbeImage): Record<string, unknown> {
  return {
    type: 'image_url',
    image_url: { url: `data:${image.mimeType};base64,${image.base64}` }
  }
}

export class LlamaCppProviderAdapter implements ProviderAdapter {
  constructor(private readonly config: LlamaCppProviderConfig = {}) {}

  private get endpoint(): string {
    return (this.config.endpoint ?? DEFAULT_LLAMACPP_ENDPOINT).replace(/\/+$/, '')
  }

  private get doFetch(): typeof fetch {
    return this.config.fetch ?? globalThis.fetch
  }

  /**
   * Asks the server whether it is up before a run, so the screen can say "start
   * llama-server" before a caregiver uploads twenty photographs and waits. Never throws.
   */
  async health(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await this.doFetch(`${this.endpoint}/health`, { method: 'GET' })
      if (response.ok) return { ok: true, message: 'The local model server is ready.' }
      const reason = classifyStatus(response.status)
      return { ok: false, message: friendlyMessage(reason, `HTTP ${response.status}`) }
    } catch (error) {
      const { reason, detail } = classifyThrown(error)
      return { ok: false, message: friendlyMessage(reason, detail) }
    }
  }

  async run(request: ProviderRequest): Promise<ProviderResult> {
    const grammar = buildProposalGrammar(request.tools)
    const model = this.config.model ?? DEFAULT_LLAMACPP_MODEL

    const body = {
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: request.caregiverText },
            ...request.probeImages.map(imageContent)
          ]
        }
      ],
      temperature: this.config.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      // llama.cpp's own extension to the OpenAI shape. A server that ignores it still
      // returns something; `parseProposalCalls` then reports malformed-response rather
      // than letting unconstrained text through as if it were proposals.
      grammar,
      cache_prompt: true,
      stream: false
    }

    const attempt = async (): Promise<ProviderResult> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      let response: Response
      try {
        response = await this.doFetch(`${this.endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
          },
          body: JSON.stringify(body),
          signal: controller.signal
        })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        const reason = classifyStatus(response.status)
        return { ok: false, reason, message: friendlyMessage(reason, `HTTP ${response.status}`) }
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'it was not JSON') }
      }

      const content = readMessageContent(payload)
      if (content === null) {
        return {
          ok: false,
          reason: 'malformed-response',
          message: friendlyMessage('malformed-response', 'no message content in the response')
        }
      }

      const calls = parseProposalCalls(content, request.tools)
      if (calls === null) {
        return {
          ok: false,
          reason: 'malformed-response',
          message: friendlyMessage('malformed-response', 'the answer was not a list of proposals')
        }
      }

      const toolCalls: ProviderToolCall[] = calls.map((c) => ({ tool: c.tool, args: c.args }))
      return { ok: true, toolCalls, model: readModelName(payload) ?? model }
    }

    try {
      return await attempt()
    } catch (firstError) {
      const first = classifyThrown(firstError)
      if (!isRetryable(first.reason)) {
        return { ok: false, reason: first.reason, message: friendlyMessage(first.reason, first.detail) }
      }
      try {
        return await attempt()
      } catch (secondError) {
        const second = classifyThrown(secondError)
        return { ok: false, reason: second.reason, message: friendlyMessage(second.reason, second.detail) }
      }
    }
  }
}

function readMessageContent(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const choices = (payload as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0]
  if (typeof first !== 'object' || first === null) return null
  const message = (first as Record<string, unknown>).message
  if (typeof message !== 'object' || message === null) return null
  const content = (message as Record<string, unknown>).content
  return typeof content === 'string' ? content : null
}

function readModelName(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const model = (payload as Record<string, unknown>).model
  return typeof model === 'string' && model.length > 0 ? model : null
}

/** Local-dev-only config, read from Vite's `import.meta.env` (`.env`, git-ignored). */
export function llamaCppConfigFromEnv(env: Record<string, string | undefined>): LlamaCppProviderConfig {
  return {
    endpoint: env.VITE_AGENT_LLAMACPP_ENDPOINT,
    model: env.VITE_AGENT_LLAMACPP_MODEL,
    apiKey: env.VITE_AGENT_LLAMACPP_API_KEY
  }
}
