/**
 * §10.6 online mode — hosted inference. The counterpart to `llamaCpp.ts`: the same
 * `ProviderAdapter` seam, the same typed failures, the same "never a blocked UI"
 * fallback, but the model is Google's `gemini-3.5-flash-lite` reached over the
 * internet through the Gemini Interactions API.
 *
 * Offline mode's privacy claim is structural — a loopback check that no config can
 * talk its way past. Online mode cannot make that claim, so it makes the two weaker
 * ones that are still worth enforcing here rather than promising elsewhere:
 *
 * 1. **One destination.** `baseUrl` is rejected unless it is HTTPS to
 *    `generativelanguage.googleapis.com`. The stored config cannot express a host, so
 *    this only guards a hand-edited `.env`, but it means the caregiver's photographs
 *    and API key have exactly one place they can go.
 *
 * 2. **Nothing moves without a key.** A missing key fails as `no-key` before a socket
 *    is opened, rather than sending the images and finding out.
 *
 * Tool calls are Gemini's own function calling with `tool_choice.allowed_tools.mode`
 * set to `any`, so the model must call one of the declared tools. That is a weaker
 * guarantee than offline mode's GBNF grammar — the sampler is not ours — which is why
 * the returned calls are still capped locally and the firewall (§10.3) still runs on
 * everything that comes back. A well-formed proposal is not a true one.
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

export interface GeminiConfig {
  /** Sent as `x-goog-api-key`. Without one the adapter fails before any request. */
  apiKey?: string
  /** The model id in the request body, e.g. `gemini-3.5-flash-lite`. */
  model?: string
  /** Must be HTTPS to Google's endpoint — see `isGoogleEndpoint`. */
  baseUrl?: string
  timeoutMs?: number
  /** Caps the calls taken from a response. Unlike the local adapter this is a trim,
   *  not a grammar constraint — a hosted sampler is not ours to constrain. */
  maxCalls?: number
  /** Injected by the checks; production passes nothing and uses global `fetch`. */
  fetch?: typeof fetch
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'
/** A hosted call over the internet has no reason to take a llama.cpp-sized minute. */
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_CALLS = 12
/** The Interactions API pins its request/response shape to a dated revision. */
const API_REVISION = '2026-05-20'
const KEY_URL = 'https://aistudio.google.com/apikey'

const ALLOWED_HOSTS = new Set(['generativelanguage.googleapis.com'])

function isGoogleEndpoint(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return ALLOWED_HOSTS.has(url.hostname.toLowerCase())
}

/**
 * Gemini's function `parameters` take an OpenAPI-subset schema, which is narrower than
 * the JSON Schema `AGENT_TOOL_SCHEMA` is written in: `additionalProperties`, `pattern`
 * and `const` are not part of it and a request carrying them is rejected outright.
 *
 * So the schema is projected onto the supported keywords rather than sent as-is.
 * Dropping `pattern` and `additionalProperties` loosens what the model is *asked* for;
 * it loosens nothing that is *accepted*, because every proposal still goes through the
 * firewall and, for the environment, through `validateEnvironment`'s own hex test.
 */
const SUPPORTED_KEYWORDS = ['type', 'description', 'enum', 'items', 'properties', 'required'] as const

export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null) return { type: 'object' }
  const source = schema as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of SUPPORTED_KEYWORDS) {
    if (!(key in source)) continue
    const value = source[key]
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, toGeminiSchema(child)])
      )
    } else if (key === 'items') {
      out.items = toGeminiSchema(value)
    } else {
      out[key] = value
    }
  }
  if (!('type' in out)) out.type = 'object'
  return out
}

function toolDirectory(tools: JsonSchemaToolList): string {
  return tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
}

function imagePart(img: ProbeImage): Record<string, unknown> {
  return { type: 'image', data: img.base64, mime_type: img.mimeType }
}

function friendlyMessage(reason: ProviderFailureReason, detail: string): string {
  switch (reason) {
    case 'not-configured':
      return 'Online mode is not configured. Choose a setup mode, or continue with manual authoring.'
    case 'no-key':
      return `Online mode needs a Gemini API key. Add one under Setup — you can create a free key at ${KEY_URL}. Or switch to offline mode, or continue with manual authoring.`
    case 'bad-key':
      return `Google rejected the API key (${detail}). Check it under Setup, or continue with manual authoring.`
    case 'rate-limited':
      return 'Google is rate-limiting this API key. Wait a moment and retry, or continue with manual authoring.'
    case 'server-unreachable':
      return 'Could not reach Google. Check this computer\'s internet connection, switch to offline mode, or continue with manual authoring.'
    case 'model-not-loaded':
      return `Google does not serve this model to this key (${detail}). Check the model id under Setup, or continue with manual authoring.`
    case 'timeout':
      return 'Google took too long to answer. Try again with fewer photographs, or continue with manual authoring.'
    case 'overloaded':
      return 'Google is busy or temporarily unavailable. Wait a moment and retry, or continue with manual authoring.'
    case 'blocked':
      return `The model declined to answer about these photographs (${detail}). Try different room photographs, or continue with manual authoring.`
    case 'malformed-response':
      return `Google's response could not be understood (${detail}). Continue with manual authoring.`
    case 'unknown':
    default:
      return `Something went wrong talking to Google (${detail}). Continue with manual authoring.`
  }
}

/** Metering and a busy backend are transient; a rejected key never is. */
function isRetryable(reason: ProviderFailureReason): boolean {
  return reason === 'timeout' || reason === 'overloaded' || reason === 'rate-limited'
}

function classifyThrown(error: unknown): { reason: ProviderFailureReason; detail: string } {
  if (error instanceof DOMException && error.name === 'AbortError') return { reason: 'timeout', detail: 'aborted' }
  if (error instanceof Error && error.name === 'AbortError') return { reason: 'timeout', detail: 'aborted' }
  // DNS failure, no route, CORS — all opaque TypeErrors from fetch. Offline mode's
  // equivalent is a refused connection; here it is usually simply being offline.
  if (error instanceof TypeError) return { reason: 'server-unreachable', detail: error.message }
  if (error instanceof Error) return { reason: 'unknown', detail: error.message }
  return { reason: 'unknown', detail: String(error) }
}

function classifyStatus(status: number, body: string): { reason: ProviderFailureReason; detail: string } {
  if (status === 401 || status === 403) return { reason: 'bad-key', detail: `HTTP ${status}` }
  if (status === 429) return { reason: 'rate-limited', detail: 'quota exceeded' }
  if (status === 404) return { reason: 'model-not-loaded', detail: 'unknown model id' }
  if (status === 400) {
    if (/api.?key/i.test(body)) return { reason: 'bad-key', detail: 'the key was not accepted' }
    if (/model/i.test(body)) return { reason: 'model-not-loaded', detail: 'the model id was not accepted' }
    return { reason: 'unknown', detail: 'HTTP 400' }
  }
  if (status >= 500) return { reason: 'overloaded', detail: `HTTP ${status}` }
  return { reason: 'unknown', detail: `HTTP ${status}` }
}

interface InteractionStep {
  type?: unknown
  name?: unknown
  arguments?: unknown
  reason?: unknown
}

/** A refusal is a real outcome, not a malformed one: the model answered, and the
 *  answer was no. Distinguishing it keeps the caregiver from retrying forever. */
function refusalOf(steps: InteractionStep[], payload: Record<string, unknown>): string | null {
  const refusal = steps.find((s) => s.type === 'refusal')
  if (refusal) return typeof refusal.reason === 'string' ? refusal.reason : 'refused'
  const finish = payload.finish_reason ?? payload.stop_reason
  if (typeof finish === 'string' && /safety|block|prohibit|recitation/i.test(finish)) return finish
  return null
}

export class GeminiProviderAdapter implements ProviderAdapter {
  constructor(private readonly config: GeminiConfig = {}) {}

  async run(request: ProviderRequest): Promise<ProviderResult> {
    const baseUrl = this.config.baseUrl ?? DEFAULT_BASE_URL
    if (!isGoogleEndpoint(baseUrl)) {
      return {
        ok: false,
        reason: 'not-configured',
        message: `Refusing to send caregiver photographs to ${baseUrl}: online mode talks to Google's Gemini API and nothing else. Fix the endpoint, switch to offline mode, or continue with manual authoring.`
      }
    }

    const apiKey = (this.config.apiKey ?? '').trim()
    if (!apiKey) return { ok: false, reason: 'no-key', message: friendlyMessage('no-key', 'no key') }

    const doFetch = this.config.fetch ?? fetch
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxCalls = this.config.maxCalls ?? DEFAULT_MAX_CALLS
    const model = this.config.model || DEFAULT_GEMINI_MODEL
    const toolNames = request.tools.map((t) => t.name)

    const body = {
      model,
      system_instruction: `${request.systemPrompt}\n\nTools available:\n${toolDirectory(request.tools)}`,
      input: [...request.probeImages.map(imagePart), { type: 'text', text: request.caregiverText }],
      tools: request.tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.parameters)
      })),
      generation_config: {
        temperature: 0,
        // `any` forces a call to one of the declared tools, so prose instead of a
        // proposal is not a failure mode we have to parse our way out of.
        tool_choice: { allowed_tools: { mode: 'any', tools: toolNames } }
      }
    }

    const attempt = async (): Promise<ProviderResult> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await doFetch(`${baseUrl.replace(/\/$/, '')}/v1beta/interactions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': apiKey,
            'Api-Revision': API_REVISION
          },
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

      let payload: Record<string, unknown>
      try {
        payload = await response.json()
      } catch {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'response was not JSON') }
      }

      const steps = Array.isArray(payload.steps) ? (payload.steps as InteractionStep[]) : null
      if (!steps) {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'no steps array') }
      }

      const refused = refusalOf(steps, payload)
      if (refused) return { ok: false, reason: 'blocked', message: friendlyMessage('blocked', refused) }

      const calls: ProviderToolCall[] = []
      for (const step of steps) {
        if (step.type !== 'function_call') continue
        if (typeof step.name !== 'string') {
          return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'a call had no tool name') }
        }
        // `mode: any` is a constraint on the sampler, not a promise from the wire.
        if (!toolNames.includes(step.name)) {
          return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', `unknown tool "${step.name}"`) }
        }
        calls.push({ tool: step.name, args: step.arguments ?? {} })
      }

      if (calls.length === 0) {
        return { ok: false, reason: 'malformed-response', message: friendlyMessage('malformed-response', 'the model called no tool') }
      }

      return {
        ok: true,
        toolCalls: calls.slice(0, maxCalls),
        model: typeof payload.model === 'string' ? payload.model : model
      }
    }

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

/**
 * Reads online-mode defaults from Vite's `import.meta.env` (`.env`, git-ignored). The
 * key here is only a convenience for a developer running the project: the setup screen
 * takes one typed into the browser, and that is what a caregiver actually uses.
 */
export function geminiConfigFromEnv(env: Record<string, string | undefined>): GeminiConfig {
  return {
    apiKey: env.VITE_GEMINI_API_KEY,
    model: env.VITE_GEMINI_MODEL,
    baseUrl: env.VITE_GEMINI_BASE_URL
  }
}
