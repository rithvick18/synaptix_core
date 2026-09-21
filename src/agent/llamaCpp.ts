/**
 * §10.6 — local inference. The only provider implementation: a `llama-server` from
 * llama.cpp, running a 4-bit quantised ~4B vision model on the caregiver's own machine,
 * reached over the loopback interface via its OpenAI-compatible endpoint.
 *
 * Two properties are worth stating because they are enforced here rather than promised
 * elsewhere:
 *
 * 1. **Nothing leaves the machine.** `baseUrl` is rejected unless it resolves to
 *    loopback, so a mistyped or hand-edited config cannot turn this into an uploader.
 *    That makes §10.6's privacy claim structural, in the same way the canvas re-encode
 *    in `images.ts` makes the EXIF strip structural.
 *
 * 2. **Malformed tool calls are impossible, not merely unlikely.** A 4B model prompted
 *    to emit JSON will sometimes emit prose instead, and Gemma-class templates have no
 *    native tool-call support to lean on. So this adapter does not ask for tool calls —
 *    it constrains them. `AGENT_TOOL_SCHEMA` is compiled into a JSON schema that
 *    llama.cpp converts to a GBNF grammar and enforces during sampling. The model
 *    physically cannot produce a token sequence outside the schema, which is a stronger
 *    guarantee than a hosted function-calling API gives.
 *
 * The firewall (§10.3) still runs on everything that comes back. A well-formed proposal
 * is not a true one.
 */
import type {
  JsonSchemaToolList,
  ProbeImage,
  ProviderAdapter,
  ProviderFailureReason,
  ProviderRequest,
  ProviderResult,
  ProviderToolCall
} from './provider'

export interface LlamaCppConfig {
  /** Where `llama-server` listens. Must be loopback — see `assertLocal`. */
  baseUrl?: string
  /** Informational: llama-server serves whichever `.gguf` it was started with. */
  model?: string
  timeoutMs?: number
  /** Caps `calls[]` in the grammar, so §10.9's `maxProposalsPerRun` is enforced by the
   *  sampler rather than by trimming an over-long list afterwards. */
  maxCalls?: number
  /** Injected by the checks; production passes nothing and uses global `fetch`. */
  fetch?: typeof fetch
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'
/** Generous: a 4B with a vision projector spends real time on prompt processing for an
 *  image, and on CPU-only hardware a first call can legitimately take a minute. */
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_CALLS = 12

const START_COMMAND =
  'llama-server -m gemma-3-4b-it-Q4_K_M.gguf --mmproj mmproj-gemma-3-4b-it-f16.gguf --port 8080'

function isLoopback(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

/**
 * Compiles the tool schema into a single constrained-decoding schema: an envelope whose
 * `calls[]` items are a discriminated union over every tool, keyed by a `const` name.
 * llama.cpp turns this into a GBNF grammar, so `tool` is always a real tool and `args`
 * always matches that tool's own parameter schema.
 */
function toolCallSchema(tools: JsonSchemaToolList, maxCalls: number): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      calls: {
        type: 'array',
        maxItems: maxCalls,
        items: {
          anyOf: tools.map((tool) => ({
            type: 'object',
            properties: { tool: { const: tool.name }, args: tool.parameters },
            required: ['tool', 'args'],
            additionalProperties: false
          }))
        }
      }
    },
    required: ['calls'],
    additionalProperties: false
  }
}

/** The tool roster is described in the system prompt because the grammar constrains
 *  shape, not choice: the model still has to know what each tool is *for*. */
function toolDirectory(tools: JsonSchemaToolList): string {
  return tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
}

function imageBlock(img: ProbeImage): Record<string, unknown> {
  return { type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } }
}

function friendlyMessage(reason: ProviderFailureReason, detail: string): string {
  switch (reason) {
    case 'not-configured':
      return 'No local model is configured. Continue with manual authoring.'
    case 'server-unreachable':
      return `Could not reach the local model. Start it with:\n  ${START_COMMAND}\nOr continue with manual authoring.`
    case 'model-not-loaded':
      return `The local model server is running but cannot handle this request (${detail}). If the photographs are being ignored, it was likely started without --mmproj, which is what gives the model vision. Or continue with manual authoring.`
    case 'timeout':
      return 'The local model took too long to answer. A smaller quantisation or fewer photographs at once will help. You can retry, or continue with manual authoring.'
    case 'overloaded':
      return 'The local model is still loading, or busy with another request. Wait a moment and retry, or continue with manual authoring.'
    case 'malformed-response':
      return `The local model's response could not be understood (${detail}). Continue with manual authoring.`
    case 'unknown':
    default:
      return `Something went wrong talking to the local model (${detail}). Continue with manual authoring.`
  }
}

/** llama-server answers 503 while weights are still loading and while every slot is
 *  busy — both genuinely transient, unlike a server that is simply not running. */
function isRetryable(reason: ProviderFailureReason): boolean {
  return reason === 'timeout' || reason === 'overloaded'
}

function classifyThrown(error: unknown): { reason: ProviderFailureReason; detail: string } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { reason: 'timeout', detail: 'aborted' }
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { reason: 'timeout', detail: 'aborted' }
  }
  // A refused connection surfaces as an opaque TypeError from fetch in both browsers
  // and node; there is no richer signal to branch on.
  if (error instanceof TypeError) {
    return { reason: 'server-unreachable', detail: error.message }
  }
  if (error instanceof Error) return { reason: 'unknown', detail: error.message }
  return { reason: 'unknown', detail: String(error) }
}

function classifyStatus(status: number, body: string): { reason: ProviderFailureReason; detail: string } {
  if (status === 503) return { reason: 'overloaded', detail: 'server loading or all slots busy' }
  if (status === 501) return { reason: 'model-not-loaded', detail: 'endpoint not implemented by this server' }
  if (status === 404) return { reason: 'model-not-loaded', detail: 'no /v1/chat/completions on this server' }
  if (status === 400 && /image|mmproj|multimodal|vision|projector/i.test(body)) {
    return { reason: 'model-not-loaded', detail: 'server rejected the image input' }
  }
  return { reason: 'unknown', detail: `HTTP ${status}` }
}

function parseToolCalls(text: string): ProviderToolCall[] | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'not JSON' }
  }
  if (typeof parsed !== 'object' || parsed === null) return { error: 'not an object' }
  const calls = (parsed as { calls?: unknown }).calls
  if (!Array.isArray(calls)) return { error: 'no calls array' }

  const out: ProviderToolCall[] = []
  for (const call of calls) {
    if (typeof call !== 'object' || call === null) return { error: 'a call was not an object' }
    const { tool, args } = call as { tool?: unknown; args?: unknown }
    if (typeof tool !== 'string') return { error: 'a call had no tool name' }
    out.push({ tool, args: args ?? {} })
  }
  return out
}

export class LlamaCppProviderAdapter implements ProviderAdapter {
  constructor(private readonly config: LlamaCppConfig = {}) {}

  async run(request: ProviderRequest): Promise<ProviderResult> {
    const baseUrl = this.config.baseUrl ?? DEFAULT_BASE_URL
    if (!isLoopback(baseUrl)) {
      return {
        ok: false,
        reason: 'not-configured',
        message: `Refusing to send caregiver photographs to ${baseUrl}: inference must stay on this machine. Point the agent at a local llama-server, or continue with manual authoring.`
      }
    }

    const doFetch = this.config.fetch ?? fetch
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxCalls = this.config.maxCalls ?? DEFAULT_MAX_CALLS

    const body = {
      model: this.config.model ?? 'local',
      temperature: 0,
      max_tokens: 2048,
      cache_prompt: true,
      messages: [
        { role: 'system', content: `${request.systemPrompt}\n\nTools available:\n${toolDirectory(request.tools)}` },
        {
          role: 'user',
          content: [...request.probeImages.map(imageBlock), { type: 'text', text: request.caregiverText }]
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'agent_tool_calls', strict: true, schema: toolCallSchema(request.tools, maxCalls) }
      }
    }

    const attempt = async (): Promise<ProviderResult> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await doFetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const { reason, detail } = classifyStatus(response.status, text)
        return { ok: false, reason, message: friendlyMessage(reason, detail) }
      }

      let payload: { choices?: { message?: { content?: unknown } }[]; model?: unknown }
      try {
        payload = await response.json()
      } catch {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'response was not JSON') }
      }

      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'no message content') }
      }

      const calls = parseToolCalls(content)
      if (!Array.isArray(calls)) {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', calls.error) }
      }

      return { ok: true, toolCalls: calls, model: typeof payload.model === 'string' ? payload.model : (this.config.model ?? 'local') }
    }

    // Retry is driven by the *result*, not only by thrown errors: llama-server signals
    // the most retryable condition there is — still loading its weights — as a 503
    // response, which never reaches a catch block.
    const attemptSafely = async (): Promise<ProviderResult> => {
      try {
        return await attempt()
      } catch (error) {
        const { reason, detail } = classifyThrown(error)
        return { ok: false, reason, message: friendlyMessage(reason, detail) }
      }
    }

    const first = await attemptSafely()
    if (first.ok || !isRetryable(first.reason)) return first
    return attemptSafely()
  }
}

/** Reads local-dev config from Vite's `import.meta.env` (`.env`, git-ignored). There is
 *  no key to read — only where the server is and which `.gguf` it was told to serve. */
export function llamaCppConfigFromEnv(env: Record<string, string | undefined>): LlamaCppConfig {
  return {
    baseUrl: env.VITE_AGENT_BASE_URL,
    model: env.VITE_AGENT_MODEL
  }
}
