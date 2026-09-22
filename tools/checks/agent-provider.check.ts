/**
 * Headless checks for Checkpoint F2's local provider adapter, config/consent and audit log.
 *
 * No network call is ever made and no `llama-server` need be running: a fake `fetch` is
 * injected through `LlamaCppConfig.fetch`, so the failure classification, the retry-once
 * policy and — most importantly — the loopback refusal are all provable offline.
 *
 * The loopback test is the one that matters. §10.6 claims caregiver photographs never
 * leave the machine; that claim is only worth as much as the check that demonstrates the
 * adapter refuses to send them anywhere else, without ever opening a socket to find out.
 */
import { LlamaCppProviderAdapter, llamaCppConfigFromEnv } from '../../src/agent/llamaCpp'
import type { ProviderRequest } from '../../src/agent/provider'
import { selectProvider, StubProviderAdapter, NullProviderAdapter } from '../../src/agent/selectProvider'
import { DEFAULT_AGENT_CONFIG, parseAgentConfig, ensureConsent, CONSENT_PROMPT, type AgentConfig } from '../../src/agent/config'
import { AuditLog, type AuditSink, type AuditEntry } from '../../src/agent/audit'
import { AGENT_TOOL_SCHEMA } from '../../src/agent/tools'

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

function completion(content: unknown, model = 'gemma-3-4b-it-Q4_K_M'): Record<string, unknown> {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason: 'stop' }]
  }
}

// ---------------------------------------------------------------------------
// 1. loopback refusal — the §10.6 privacy property, enforced before any socket
// ---------------------------------------------------------------------------

{
  for (const hostile of [
    'https://api.example.com',
    'http://10.0.0.5:8080',
    'http://evil.test:8080',
    'http://127.0.0.1.attacker.test:8080',
    'file:///etc/passwd'
  ]) {
    let called = false
    const adapter = new LlamaCppProviderAdapter({
      baseUrl: hostile,
      fetch: async () => { called = true; return jsonResponse(200, completion({ calls: [] })) }
    })
    const result = await adapter.run(WITH_IMAGE)
    eq(result.ok, false, `loopback: refuses ${hostile}`)
    ok(!result.ok && result.reason === 'not-configured', `loopback: ${hostile} is not-configured`)
    ok(!called, `loopback: never opens a connection to ${hostile}`)
  }

  for (const allowed of ['http://127.0.0.1:8080', 'http://localhost:8080', 'http://[::1]:8080']) {
    let called = false
    const adapter = new LlamaCppProviderAdapter({
      baseUrl: allowed,
      fetch: async () => { called = true; return jsonResponse(200, completion({ calls: [] })) }
    })
    const result = await adapter.run(REQUEST)
    ok(called, `loopback: accepts ${allowed}`)
    eq(result.ok, true, `loopback: ${allowed} succeeds`)
  }
}

// ---------------------------------------------------------------------------
// 2. server-unreachable — llama-server not running, and not retried
// ---------------------------------------------------------------------------

{
  let calls = 0
  const adapter = new LlamaCppProviderAdapter({
    fetch: async () => { calls++; throw new TypeError('fetch failed') }
  })
  const result = await adapter.run(REQUEST)
  ok(!result.ok && result.reason === 'server-unreachable', 'unreachable: classified as server-unreachable')
  eq(calls, 1, 'unreachable: not retried — asking twice will not start a server')
  ok(!result.ok && result.message.includes('llama-server'), 'unreachable: the message tells the caregiver the command to run')
}

// ---------------------------------------------------------------------------
// 3. overloaded — 503 is retried exactly once, and succeeds on the retry
// ---------------------------------------------------------------------------

{
  let calls = 0
  const adapter = new LlamaCppProviderAdapter({
    fetch: async () => {
      calls++
      return calls === 1
        ? jsonResponse(503, { error: { code: 503, message: 'Loading model', type: 'unavailable_error' } })
        : jsonResponse(200, completion({ calls: [{ tool: 'request_caregiver_input', args: { field: 'who', why: 'unnamed' } }] }))
    }
  })
  const result = await adapter.run(REQUEST)
  eq(calls, 2, 'overloaded: retried exactly once')
  eq(result.ok, true, 'overloaded: the retry result is used')
  ok(result.ok && result.toolCalls[0].tool === 'request_caregiver_input', 'overloaded: the retry payload is parsed')
}

{
  let calls = 0
  const adapter = new LlamaCppProviderAdapter({
    fetch: async () => { calls++; return jsonResponse(503, { error: { message: 'Loading model' } }) }
  })
  const result = await adapter.run(REQUEST)
  eq(calls, 2, 'overloaded: retries once and then gives up — never a third attempt')
  ok(!result.ok && result.reason === 'overloaded', 'overloaded: persistent 503 stays overloaded')
}

// ---------------------------------------------------------------------------
// 4. model-not-loaded — started without --mmproj, so it cannot see
// ---------------------------------------------------------------------------

{
  const adapter = new LlamaCppProviderAdapter({
    fetch: async () => jsonResponse(400, { error: { message: 'multimodal support is not enabled: no mmproj loaded' } })
  })
  const result = await adapter.run(WITH_IMAGE)
  ok(!result.ok && result.reason === 'model-not-loaded', 'no-mmproj: classified as model-not-loaded')
  ok(!result.ok && result.message.includes('--mmproj'), 'no-mmproj: the message names the missing flag')
}

{
  const adapter = new LlamaCppProviderAdapter({ fetch: async () => jsonResponse(404, {}) })
  const result = await adapter.run(REQUEST)
  ok(!result.ok && result.reason === 'model-not-loaded', '404: classified as model-not-loaded')
}

// ---------------------------------------------------------------------------
// 5. malformed-response — defensive, since the grammar should prevent it
// ---------------------------------------------------------------------------

{
  const cases: [unknown, string][] = [
    ['I think you should place the photo above the sofa.', 'prose instead of JSON'],
    [{ notCalls: [] }, 'an object with no calls array'],
    [{ calls: [{ args: {} }] }, 'a call with no tool name'],
    [{ calls: 'nope' }, 'calls that is not an array']
  ]
  for (const [content, label] of cases) {
    const adapter = new LlamaCppProviderAdapter({ fetch: async () => jsonResponse(200, completion(content)) })
    const result = await adapter.run(REQUEST)
    ok(!result.ok && result.reason === 'malformed-response', `malformed: rejects ${label}`)
  }
}

// ---------------------------------------------------------------------------
// 6. the request body — grammar constraint, image encoding, tool roster
// ---------------------------------------------------------------------------

{
  let sent: Record<string, unknown> = {}
  let url = ''
  const adapter = new LlamaCppProviderAdapter({
    maxCalls: 5,
    fetch: async (input, init) => {
      url = String(input)
      sent = JSON.parse(String(init?.body))
      return jsonResponse(200, completion({ calls: [] }))
    }
  })
  await adapter.run(WITH_IMAGE)

  eq(url, 'http://127.0.0.1:8080/v1/chat/completions', 'request: hits the OpenAI-compatible endpoint on loopback')

  const format = sent.response_format as { type?: string; json_schema?: { schema?: Record<string, unknown> } }
  eq(format?.type, 'json_schema', 'request: output is grammar-constrained, not merely requested')

  const callsSchema = (format.json_schema?.schema as { properties?: { calls?: { maxItems?: number; items?: { anyOf?: unknown[] } } } })?.properties?.calls
  eq(callsSchema?.maxItems, 5, 'request: maxProposalsPerRun is enforced by the sampler')
  eq(callsSchema?.items?.anyOf?.length, AGENT_TOOL_SCHEMA.length, 'request: every tool appears in the union, and only tools')

  const names = (callsSchema?.items?.anyOf as { properties: { tool: { const: string } } }[]).map((b) => b.properties.tool.const)
  ok(!names.includes('commitProposal'), 'request: commitProposal is unreachable — §10.2 "Not a tool"')
  ok(!names.includes('rejectProposal'), 'request: rejectProposal is unreachable')
  ok(names.includes('request_caregiver_input'), 'request: the escape hatch is offered')

  const messages = sent.messages as { role: string; content: unknown }[]
  const userContent = messages[1].content as { type: string; image_url?: { url: string } }[]
  eq(userContent[0].type, 'image_url', 'request: the probe image is attached as a vision block')
  ok(userContent[0].image_url?.url.startsWith('data:image/jpeg;base64,') === true, 'request: the probe travels inline as a data URI')
  eq(sent.temperature, 0, 'request: deterministic sampling, matching the project ethos')
}

// ---------------------------------------------------------------------------
// 7. success path and selectProvider wiring
// ---------------------------------------------------------------------------

{
  const adapter = new LlamaCppProviderAdapter({
    fetch: async () => jsonResponse(200, completion({
      calls: [
        { tool: 'propose_photo_placement', args: { assetId: 'a1', anchorId: 'wall-1', crop: { x: 0, y: 0, width: 1, height: 1 }, rationale: 'r' } },
        { tool: 'request_caregiver_input', args: { field: 'name', why: 'not stated' } }
      ]
    }))
  })
  const result = await adapter.run(WITH_IMAGE)
  eq(result.ok, true, 'success: a well-formed envelope parses')
  eq(result.ok && result.toolCalls.length, 2, 'success: every call is returned')
  eq(result.ok && result.model, 'gemma-3-4b-it-Q4_K_M', 'success: the served model id is reported for provenance')
}

{
  eq(DEFAULT_AGENT_CONFIG.enabled, false, 'config: agent is disabled by default')

  const stubAdapter = selectProvider(DEFAULT_AGENT_CONFIG, {
    stubScript: { name: 's', calls: [{ tool: 'request_caregiver_input', args: { field: 'x', why: 'y' } }] }
  })
  ok(stubAdapter instanceof StubProviderAdapter, 'selectProvider: "stub" selects StubProviderAdapter')
  const stubResult = await stubAdapter.run(REQUEST)
  eq(stubResult.ok, true, 'selectProvider: stub adapter succeeds without a network call')

  const noneAdapter = selectProvider({ ...DEFAULT_AGENT_CONFIG, provider: 'none' })
  ok(noneAdapter instanceof NullProviderAdapter, 'selectProvider: "none" selects NullProviderAdapter')
  const noneResult = await noneAdapter.run(REQUEST)
  eq(noneResult.ok, false, 'selectProvider: "none" always fails safely')

  const localAdapter = selectProvider({ ...DEFAULT_AGENT_CONFIG, provider: 'llama-cpp' })
  ok(localAdapter instanceof LlamaCppProviderAdapter, 'selectProvider: "llama-cpp" selects the local adapter')
}

{
  const fromEnv = llamaCppConfigFromEnv({ VITE_AGENT_BASE_URL: 'http://127.0.0.1:9090', VITE_AGENT_MODEL: 'qwen' })
  eq(fromEnv.baseUrl, 'http://127.0.0.1:9090', 'env: baseUrl is read from .env')
  eq(fromEnv.model, 'qwen', 'env: model is read from .env')
  ok(!('apiKey' in fromEnv), 'env: there is no API key to read — nothing authenticates')
}

// ---------------------------------------------------------------------------
// 8. config parsing — malformed/hand-edited storage never silently enables the agent
// ---------------------------------------------------------------------------

{
  eq(parseAgentConfig(null).enabled, false, 'config: null input falls back to the safe default')
  eq(parseAgentConfig('garbage').enabled, false, 'config: a non-object falls back to the safe default')
  eq(parseAgentConfig({ enabled: 'yes' as unknown }).enabled, false, 'config: a wrong-typed field falls back rather than coercing')
  eq(parseAgentConfig({ provider: 'anthropic' }).provider, 'stub', 'config: a hosted provider is not a recognised value and falls back to stub')
  eq(parseAgentConfig({ provider: 'openai' }).provider, 'stub', 'config: an unrecognised provider falls back to stub')
  ok(!('baseUrl' in parseAgentConfig({ baseUrl: 'https://api.example.com' })), 'config: stored config cannot express an endpoint at all')
  const good: AgentConfig = { ...DEFAULT_AGENT_CONFIG, enabled: true, provider: 'llama-cpp', consentGiven: true }
  eq(parseAgentConfig(good).enabled, true, 'config: a well-formed object round-trips')
}

// ---------------------------------------------------------------------------
// 9. consent — gates the first call, declining changes nothing else
// ---------------------------------------------------------------------------

{
  let asked = 0
  const notYetConsented: AgentConfig = { ...DEFAULT_AGENT_CONFIG, enabled: true, provider: 'llama-cpp' }
  const declined = await ensureConsent(notYetConsented, async (prompt) => {
    asked++
    eq(prompt, CONSENT_PROMPT, 'consent: the dialog is shown the §10.6 prompt content')
    return false
  })
  eq(asked, 1, 'consent: asks exactly once when not yet given')
  eq(declined.allowed, false, 'consent: declining is not allowed')
  eq(declined.config.enabled, true, 'consent: declining does not touch unrelated config fields')
  eq(declined.config.provider, 'llama-cpp', 'consent: declining does not force provider back to none')
  eq(declined.config.consentGiven, false, 'consent: declining leaves consentGiven false')

  ok(CONSENT_PROMPT.notSent.some((s) => /internet/i.test(s)), 'consent: the dialog states that nothing reaches the internet')

  const alreadyConsented: AgentConfig = { ...DEFAULT_AGENT_CONFIG, consentGiven: true }
  let askedAgain = false
  const result = await ensureConsent(alreadyConsented, async () => { askedAgain = true; return true })
  ok(!askedAgain, 'consent: never re-asks once granted')
  eq(result.allowed, true, 'consent: already-granted consent allows immediately')
}

// ---------------------------------------------------------------------------
// 10. audit log — never carries image content or caregiver text
// ---------------------------------------------------------------------------

{
  const lines: string[] = []
  const sink: AuditSink = { write: (line) => lines.push(line) }
  const log = new AuditLog(sink)
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    tool: 'propose_photo_placement',
    assetId: 'asset-1',
    byteCount: 12345,
    modelId: 'gemma-3-4b-it-Q4_K_M',
    promptVersion: 'f-1',
    outcome: 'ok'
  }
  log.record(entry)
  eq(lines.length, 1, 'audit: writes one line per record')
  const parsed = JSON.parse(lines[0]) as Record<string, unknown>
  ok(Object.keys(parsed).sort().join(',') === Object.keys(entry).sort().join(','), 'audit: the logged shape matches AuditEntry exactly — no extra fields')
  // Structural guarantee: AuditEntry has no field that could hold caregiver text or
  // image bytes, so there is nothing to assert-away here beyond the shape above —
  // that IS the guarantee. This assertion documents the fields explicitly allowed.
  const allowed = new Set(['timestamp', 'tool', 'assetId', 'byteCount', 'modelId', 'promptVersion', 'outcome'])
  ok(Object.keys(parsed).every((k) => allowed.has(k)), 'audit: only allow-listed fields ever reach the sink')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
