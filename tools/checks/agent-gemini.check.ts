/**
 * Headless checks for the online setup mode: the Gemini adapter, and the setup-mode
 * config that chooses between it and the local one.
 *
 * No network call is ever made and no API key is needed: a fake `fetch` is injected
 * through `GeminiConfig.fetch`, so the request shape, the failure classification, the
 * retry policy and the endpoint refusal are all provable offline — including, in
 * particular, the cases where the point is that *nothing was sent*.
 *
 * Two of these matter more than the rest. Online mode gives up offline mode's "nothing
 * leaves this machine" guarantee, so what is left to enforce is that the photographs
 * have exactly one possible destination (§1) and that nothing is sent at all without a
 * key (§2). And because agreeing to a local model is not agreeing to a hosted one,
 * §10 proves consent cannot carry across a mode change.
 */
import { GeminiProviderAdapter, geminiConfigFromEnv, toGeminiSchema, DEFAULT_GEMINI_MODEL } from '../../src/agent/gemini'
import { LlamaCppProviderAdapter } from '../../src/agent/llamaCpp'
import type { ProviderRequest } from '../../src/agent/provider'
import { selectProvider } from '../../src/agent/selectProvider'
import {
  CONSENT_PROMPT,
  DEFAULT_AGENT_CONFIG,
  ONLINE_CONSENT_PROMPT,
  ONLINE_MODEL,
  applySetupMode,
  consentPromptFor,
  ensureConsent,
  needsSetup,
  parseAgentConfig,
  providerForMode,
  type AgentConfig
} from '../../src/agent/config'
import { AGENT_TOOL_SCHEMA } from '../../src/agent/tools'
import { describeEnvironment } from '../../src/agent/environment'

let checks = 0
const failures: string[] = []

function ok(condition: boolean, label: string): void {
  checks++
  if (!condition) failures.push(label)
}

function eq<T>(actual: T, expected: T, label: string): void {
  checks++
  if (actual !== expected) failures.push(`${label}\n     expected ${String(expected)}, got ${String(actual)}`)
}

const KEY = 'AIza-test-key'

const REQUEST: ProviderRequest = {
  systemPrompt: 'test',
  tools: AGENT_TOOL_SCHEMA,
  caregiverText: 'Ananya is my granddaughter.',
  probeImages: []
}

const WITH_IMAGE: ProviderRequest = {
  ...REQUEST,
  probeImages: [{ assetId: 'asset-1', mimeType: 'image/jpeg', base64: 'AAAA' }]
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function interaction(steps: unknown[], model = ONLINE_MODEL): Record<string, unknown> {
  return { id: 'int-1', model, steps, output_text: '' }
}

const ONE_CALL = [{ type: 'function_call', id: 'c1', name: 'request_caregiver_input', arguments: { field: 'name', why: 'not stated' } }]

// ---------------------------------------------------------------------------
// 1. one destination — enforced before any socket is opened
// ---------------------------------------------------------------------------

{
  for (const hostile of [
    'http://generativelanguage.googleapis.com',
    'https://generativelanguage.googleapis.com.attacker.test',
    'https://api.example.com',
    'https://evil.test',
    'http://127.0.0.1:8080',
    'file:///etc/passwd',
    'not a url'
  ]) {
    let called = false
    const adapter = new GeminiProviderAdapter({
      apiKey: KEY,
      baseUrl: hostile,
      fetch: async () => { called = true; return jsonResponse(200, interaction(ONE_CALL)) }
    })
    const result = await adapter.run(WITH_IMAGE)
    eq(result.ok, false, `endpoint: refuses ${hostile}`)
    ok(!result.ok && result.reason === 'not-configured', `endpoint: ${hostile} is not-configured`)
    ok(!called, `endpoint: never opens a connection to ${hostile}`)
  }

  let reached = ''
  const adapter = new GeminiProviderAdapter({
    apiKey: KEY,
    fetch: async (input) => { reached = String(input); return jsonResponse(200, interaction(ONE_CALL)) }
  })
  const result = await adapter.run(WITH_IMAGE)
  eq(result.ok, true, 'endpoint: the default Google endpoint is allowed')
  eq(reached, 'https://generativelanguage.googleapis.com/v1beta/interactions', 'endpoint: hits the Interactions API over HTTPS')
}

// ---------------------------------------------------------------------------
// 2. no key, no request — the photographs are not sent to find out
// ---------------------------------------------------------------------------

{
  for (const [label, key] of [['absent', undefined], ['empty', ''], ['whitespace', '   ']] as const) {
    let called = false
    const adapter = new GeminiProviderAdapter({ apiKey: key, fetch: async () => { called = true; return jsonResponse(200, interaction(ONE_CALL)) } })
    const result = await adapter.run(WITH_IMAGE)
    ok(!result.ok && result.reason === 'no-key', `no-key: a ${label} key fails as no-key`)
    ok(!called, `no-key: a ${label} key sends nothing`)
    ok(!result.ok && /offline mode|manual authoring/i.test(result.message), `no-key: a ${label} key still offers a way forward`)
  }
}

// ---------------------------------------------------------------------------
// 3. request shape
// ---------------------------------------------------------------------------

{
  let sent: Record<string, unknown> = {}
  let headers: Record<string, string> = {}
  const adapter = new GeminiProviderAdapter({
    apiKey: KEY,
    maxCalls: 5,
    fetch: async (_input, init) => {
      sent = JSON.parse(String(init?.body))
      headers = init?.headers as Record<string, string>
      return jsonResponse(200, interaction(ONE_CALL))
    }
  })
  await adapter.run(WITH_IMAGE)

  eq(headers['x-goog-api-key'], KEY, 'request: the key travels in the header, never the URL')
  ok(typeof headers['Api-Revision'] === 'string', 'request: the Interactions API revision is pinned')
  eq(sent.model, DEFAULT_GEMINI_MODEL, 'request: the default model is gemini-3.5-flash-lite')
  eq(DEFAULT_GEMINI_MODEL, 'gemini-3.5-flash-lite', 'request: that id is the one the project asked for')
  ok(String(sent.system_instruction).includes('request_caregiver_input'), 'request: the tool directory is in the system instruction')

  const input = sent.input as { type: string; data?: string; mime_type?: string; text?: string }[]
  eq(input[0].type, 'image', 'request: the probe image is attached as an image part')
  eq(input[0].data, 'AAAA', 'request: the probe travels as inline base64')
  eq(input[0].mime_type, 'image/jpeg', 'request: with its own mime type')
  eq(input[1].text, 'Ananya is my granddaughter.', "request: the caregiver's notes are the text part")

  const tools = sent.tools as { type: string; name: string; parameters: Record<string, unknown> }[]
  eq(tools.length, AGENT_TOOL_SCHEMA.length, 'request: every tool is declared, and only tools')
  ok(tools.every((t) => t.type === 'function'), 'request: each is declared as a function')
  const names = tools.map((t) => t.name)
  ok(!names.includes('commitProposal'), 'request: commitProposal is unreachable — §10.2 "Not a tool"')
  ok(!names.includes('rejectProposal'), 'request: rejectProposal is unreachable')
  ok(names.includes('request_caregiver_input'), 'request: the escape hatch is offered')

  const config = sent.generation_config as { temperature?: number; tool_choice?: { allowed_tools?: { mode?: string; tools?: string[] } } }
  eq(config?.temperature, 0, 'request: deterministic sampling, matching the project ethos')
  eq(config?.tool_choice?.allowed_tools?.mode, 'any', 'request: the model must call a tool, not write prose')
  eq(config?.tool_choice?.allowed_tools?.tools?.length, AGENT_TOOL_SCHEMA.length, 'request: the allowed-tool list is exactly the declared tools')

  // Gemini's parameter schema is an OpenAPI subset: these keywords are rejected by the
  // API, so a schema sent verbatim would fail every request for every tool.
  const serialised = JSON.stringify(tools)
  for (const keyword of ['additionalProperties', 'pattern', 'const', 'anyOf']) {
    ok(!serialised.includes(keyword), `request: "${keyword}" is projected out of the declared schemas`)
  }
  ok(serialised.includes('"required"') && serialised.includes('"properties"'), 'request: the supported keywords survive the projection')
}

{
  const projected = toGeminiSchema({
    type: 'object',
    additionalProperties: false,
    properties: {
      colour: { type: 'string', pattern: '^#[0-9a-f]{6}$' },
      tags: { type: 'array', items: { type: 'string', pattern: 'x' } },
      nested: { type: 'object', additionalProperties: false, properties: { a: { type: 'string', enum: ['x'] } } }
    },
    required: ['colour']
  })
  ok(!('additionalProperties' in projected), 'schema: additionalProperties is dropped at the top level')
  const props = projected.properties as Record<string, Record<string, unknown>>
  ok(!('pattern' in props.colour), 'schema: pattern is dropped from a leaf')
  ok(!('pattern' in (props.tags.items as Record<string, unknown>)), 'schema: pattern is dropped inside array items')
  ok(!('additionalProperties' in props.nested), 'schema: the projection recurses into nested objects')
  eq(((props.nested.properties as Record<string, Record<string, unknown>>).a.enum as string[])[0], 'x', 'schema: enum survives')
  eq((projected.required as string[])[0], 'colour', 'schema: required survives')
  eq(toGeminiSchema(null).type, 'object', 'schema: a missing schema becomes an empty object schema')
}

// ---------------------------------------------------------------------------
// 4. success path
// ---------------------------------------------------------------------------

{
  const adapter = new GeminiProviderAdapter({
    apiKey: KEY,
    fetch: async () => jsonResponse(200, interaction([
      { type: 'function_call', id: 'c1', name: 'propose_photo_placement', arguments: { assetId: 'a1', anchorId: 'wall-1', crop: { x: 0, y: 0, width: 1, height: 1 }, rationale: 'r' } },
      { type: 'text', text: 'ignored' },
      { type: 'function_call', id: 'c2', name: 'request_caregiver_input', arguments: { field: 'name', why: 'not stated' } }
    ]))
  })
  const result = await adapter.run(WITH_IMAGE)
  eq(result.ok, true, 'success: function-call steps parse')
  eq(result.ok && result.toolCalls.length, 2, 'success: non-call steps are ignored, calls are kept')
  eq(result.ok && result.toolCalls[0].tool, 'propose_photo_placement', 'success: the tool name comes through')
  eq(result.ok && result.model, ONLINE_MODEL, 'success: the served model id is reported for provenance')
}

{
  // A hosted sampler is not ours to constrain, so the cap is applied on arrival.
  const adapter = new GeminiProviderAdapter({
    apiKey: KEY,
    maxCalls: 1,
    fetch: async () => jsonResponse(200, interaction([...ONE_CALL, { type: 'function_call', id: 'c2', name: 'request_caregiver_input', arguments: {} }]))
  })
  const result = await adapter.run(WITH_IMAGE)
  eq(result.ok && result.toolCalls.length, 1, 'cap: maxProposalsPerRun trims an over-long response')
}

// ---------------------------------------------------------------------------
// 5. malformed and refused responses
// ---------------------------------------------------------------------------

{
  const cases: [string, unknown][] = [
    ['no steps array', { id: 'x' }],
    ['a call with no name', interaction([{ type: 'function_call', arguments: {} }])],
    ['a tool that was never declared', interaction([{ type: 'function_call', name: 'commitProposal', arguments: {} }])],
    ['no tool call at all', interaction([{ type: 'text', text: 'here are some ideas' }])]
  ]
  for (const [label, body] of cases) {
    const adapter = new GeminiProviderAdapter({ apiKey: KEY, fetch: async () => jsonResponse(200, body) })
    const result = await adapter.run(WITH_IMAGE)
    ok(!result.ok && result.reason === 'malformed-response', `malformed: rejects ${label}`)
  }

  const notJson = new GeminiProviderAdapter({ apiKey: KEY, fetch: async () => new Response('<html>', { status: 200 }) })
  const result = await notJson.run(WITH_IMAGE)
  ok(!result.ok && result.reason === 'malformed-response', 'malformed: rejects a non-JSON body')
}

{
  for (const [label, body] of [
    ['an explicit refusal step', interaction([{ type: 'refusal', reason: 'safety' }])],
    ['a safety finish reason', { ...interaction([]), finish_reason: 'SAFETY' }]
  ] as [string, unknown][]) {
    const adapter = new GeminiProviderAdapter({ apiKey: KEY, fetch: async () => jsonResponse(200, body) })
    const result = await adapter.run(WITH_IMAGE)
    ok(!result.ok && result.reason === 'blocked', `refusal: ${label} is blocked, not malformed`)
  }
}

// ---------------------------------------------------------------------------
// 6. HTTP status classification, and what is worth retrying
// ---------------------------------------------------------------------------

{
  const cases: [number, string, string][] = [
    [401, 'bad-key', 'an unauthenticated request'],
    [403, 'bad-key', 'a forbidden key'],
    [404, 'model-not-loaded', 'an unknown model id'],
    [429, 'rate-limited', 'a metered key'],
    [500, 'overloaded', 'a server error'],
    [503, 'overloaded', 'an unavailable backend']
  ]
  for (const [status, reason, label] of cases) {
    const adapter = new GeminiProviderAdapter({ apiKey: KEY, fetch: async () => jsonResponse(status, { error: { message: label } }) })
    const result = await adapter.run(WITH_IMAGE)
    ok(!result.ok && result.reason === reason, `status: ${status} is ${reason} (${label})`)
  }

  const badKey400 = new GeminiProviderAdapter({
    apiKey: KEY,
    fetch: async () => jsonResponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })
  })
  const result = await badKey400.run(WITH_IMAGE)
  ok(!result.ok && result.reason === 'bad-key', 'status: a 400 naming the API key is a key problem, not a mystery')
}

{
  let attempts = 0
  const adapter = new GeminiProviderAdapter({
    apiKey: KEY,
    fetch: async () => { attempts++; return attempts === 1 ? jsonResponse(429, {}) : jsonResponse(200, interaction(ONE_CALL)) }
  })
  const result = await adapter.run(WITH_IMAGE)
  eq(attempts, 2, 'retry: a rate-limit is retried once')
  eq(result.ok, true, 'retry: the second attempt is used')
}

{
  let attempts = 0
  const adapter = new GeminiProviderAdapter({ apiKey: KEY, fetch: async () => { attempts++; return jsonResponse(403, {}) } })
  await adapter.run(WITH_IMAGE)
  eq(attempts, 1, 'retry: a rejected key is never retried — it will not fix itself')
}

{
  const adapter = new GeminiProviderAdapter({ apiKey: KEY, fetch: async () => { throw new TypeError('Failed to fetch') } })
  const result = await adapter.run(WITH_IMAGE)
  ok(!result.ok && result.reason === 'server-unreachable', 'offline: a failed fetch is classified as unreachable')
  ok(!result.ok && /offline mode/i.test(result.message), 'offline: and the message points at the other setup mode')
}

// ---------------------------------------------------------------------------
// 7. env
// ---------------------------------------------------------------------------

{
  const fromEnv = geminiConfigFromEnv({ VITE_GEMINI_API_KEY: 'k', VITE_GEMINI_MODEL: 'gemini-3.5-flash-lite' })
  eq(fromEnv.apiKey, 'k', 'env: the key is read from .env for developers')
  eq(fromEnv.model, 'gemini-3.5-flash-lite', 'env: the model id is read from .env')
}

// ---------------------------------------------------------------------------
// 8. selectProvider — the setup mode is the only thing that picks an adapter
// ---------------------------------------------------------------------------

{
  eq(providerForMode('offline'), 'llama-cpp', 'mode: offline selects the local provider')
  eq(providerForMode('online'), 'gemini', 'mode: online selects Gemini')

  const online = applySetupMode(DEFAULT_AGENT_CONFIG, 'online', { apiKey: KEY })
  ok(selectProvider(online) instanceof GeminiProviderAdapter, 'selectProvider: "gemini" selects the Gemini adapter')
  const offline = applySetupMode(DEFAULT_AGENT_CONFIG, 'offline')
  ok(selectProvider(offline) instanceof LlamaCppProviderAdapter, 'selectProvider: "llama-cpp" still selects the local adapter')

  // The key typed into the browser must beat an absent or stale one in .env.
  let usedKey = ''
  const adapter = selectProvider(online, {
    gemini: { apiKey: undefined, model: undefined, fetch: async (_i, init) => { usedKey = (init?.headers as Record<string, string>)['x-goog-api-key']; return jsonResponse(200, interaction(ONE_CALL)) } }
  })
  await adapter.run(WITH_IMAGE)
  eq(usedKey, KEY, 'selectProvider: the stored key survives an env config that has none')

  let envKey = ''
  const noStoredKey = { ...online, apiKey: '' }
  const envAdapter = selectProvider(noStoredKey, {
    gemini: { apiKey: 'from-env', fetch: async (_i, init) => { envKey = (init?.headers as Record<string, string>)['x-goog-api-key']; return jsonResponse(200, interaction(ONE_CALL)) } }
  })
  await envAdapter.run(WITH_IMAGE)
  eq(envKey, 'from-env', 'selectProvider: .env fills in when nothing was typed in the browser')

  const keyless = selectProvider({ ...online, apiKey: '' })
  const keylessResult = await keyless.run(WITH_IMAGE)
  ok(!keylessResult.ok && keylessResult.reason === 'no-key', 'selectProvider: online with no key anywhere fails safely')
}

// ---------------------------------------------------------------------------
// 9. the setup screen's question — unanswered by default
// ---------------------------------------------------------------------------

{
  ok(needsSetup(DEFAULT_AGENT_CONFIG), 'setup: no mode is chosen by default, so the screen is shown at start')
  eq(DEFAULT_AGENT_CONFIG.setupMode, null, 'setup: "not asked" is its own state, not a third mode')
  eq(DEFAULT_AGENT_CONFIG.apiKey, '', 'setup: no key ships with the app')

  const online = applySetupMode(DEFAULT_AGENT_CONFIG, 'online', { apiKey: `  ${KEY}  ` })
  ok(!needsSetup(online), 'setup: answering the screen clears the question')
  eq(online.provider, 'gemini', 'setup: online sets the Gemini provider')
  eq(online.model, ONLINE_MODEL, 'setup: online defaults to gemini-3.5-flash-lite')
  eq(online.apiKey, KEY, 'setup: the pasted key is trimmed')
  eq(online.enabled, true, 'setup: choosing a mode enables the feature')

  const offline = applySetupMode(online, 'offline')
  eq(offline.provider, 'llama-cpp', 'setup: offline sets the local provider')
  eq(offline.apiKey, '', 'setup: going offline drops the stored key — the machine keeps no credential')
  eq(offline.model, 'gemma-3-4b-it-Q4_K_M', 'setup: offline names the local model')

  eq(parseAgentConfig({ setupMode: 'cloud' }).setupMode, null, 'setup: an unrecognised stored mode falls back to unasked')
  eq(parseAgentConfig({ setupMode: 'online' }).setupMode, 'online', 'setup: a valid stored mode round-trips')
  eq(parseAgentConfig({ apiKey: 42 as unknown }).apiKey, '', 'setup: a wrong-typed key falls back rather than coercing')
  ok(!('baseUrl' in parseAgentConfig({ baseUrl: 'https://api.example.com' })), 'setup: stored config still cannot express an endpoint')
}

// ---------------------------------------------------------------------------
// 10. consent never crosses a mode change
// ---------------------------------------------------------------------------

{
  const consentedOnline: AgentConfig = { ...applySetupMode(DEFAULT_AGENT_CONFIG, 'online', { apiKey: KEY }), consentGiven: true }
  eq(applySetupMode(consentedOnline, 'offline').consentGiven, false, 'consent: agreeing to Gemini is not agreeing to a local model')

  const consentedOffline: AgentConfig = { ...applySetupMode(DEFAULT_AGENT_CONFIG, 'offline'), consentGiven: true }
  eq(applySetupMode(consentedOffline, 'online', { apiKey: KEY }).consentGiven, false, 'consent: agreeing to a local model is not agreeing to Gemini')
  eq(applySetupMode(consentedOffline, 'offline').consentGiven, true, 'consent: re-saving the same mode does not re-ask')

  let shown: string[] = []
  await ensureConsent({ ...applySetupMode(DEFAULT_AGENT_CONFIG, 'online', { apiKey: KEY }) }, async (prompt) => {
    shown = [prompt.provider, ...prompt.sent, ...prompt.notSent]
    return false
  })
  ok(shown.some((line) => /internet/i.test(line)), 'consent: online mode says the photographs cross the internet')
  ok(shown.some((line) => new RegExp(ONLINE_MODEL).test(line)), 'consent: online mode names the model by id')

  eq(consentPromptFor('online'), ONLINE_CONSENT_PROMPT, 'consent: online mode gets the online prompt')
  eq(consentPromptFor('offline'), CONSENT_PROMPT, 'consent: offline mode gets the local prompt')
  eq(consentPromptFor(null), CONSENT_PROMPT, 'consent: an unanswered setup defaults to the stricter prompt')
  ok(
    ONLINE_CONSENT_PROMPT.notSent.some((s) => /original photo files/i.test(s)),
    'consent: online mode still promises the originals stay here — the one line both modes share'
  )
  ok(
    !ONLINE_CONSENT_PROMPT.notSent.some((s) => /no photograph, note or telemetry leaves this machine/i.test(s)),
    'consent: online mode does not repeat offline mode\'s promise it cannot keep'
  )
}

// ---------------------------------------------------------------------------
// 11. the whole online path — a room photograph in, a validated environment out
// ---------------------------------------------------------------------------

{
  const style = { wall: '#8FA98C', floor: '#C8A97E', wood: '#6B4A2F', fabric: '#D9CDB8', accent: '#2F5D50', floorType: 'wood', light: 'warm' }
  let declared = ''
  const adapter = new GeminiProviderAdapter({
    apiKey: KEY,
    maxCalls: 1,
    fetch: async (_i, init) => {
      declared = JSON.stringify((JSON.parse(String(init?.body)) as { tools: unknown }).tools)
      return jsonResponse(200, interaction([{ type: 'function_call', id: 'c1', name: 'set_environment', arguments: style }]))
    }
  })
  const result = await describeEnvironment(adapter, [{ assetId: 'room-0', mimeType: 'image/jpeg', base64: 'AAAA' }], 'match the green walls')
  eq(result.style.wall, '#8FA98C', 'environment: the online path yields the model\'s palette')
  eq(result.style.floorType, 'wood', 'environment: and its floor material')
  eq(result.model, ONLINE_MODEL, 'environment: provenance records the hosted model id')

  // The projection drops `pattern`, so the hex format is not asked for on the wire.
  // What makes that safe is that `validateEnvironment` still refuses a bad colour.
  ok(!declared.includes('pattern'), 'environment: the hex pattern is projected out of the declared schema')
  const loose = new GeminiProviderAdapter({
    apiKey: KEY,
    fetch: async () => jsonResponse(200, interaction([{ type: 'function_call', id: 'c1', name: 'set_environment', arguments: { ...style, wall: 'greenish' } }]))
  })
  let refused = ''
  try {
    await describeEnvironment(loose, [{ assetId: 'room-0', mimeType: 'image/jpeg', base64: 'AAAA' }], '')
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error)
  }
  ok(/Invalid wall colour/i.test(refused), 'environment: a non-hex colour is still refused after arrival')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
