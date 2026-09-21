/**
 * Headless checks for Checkpoint F2's provider adapter, config/consent and audit log.
 * No real network call is ever made — a fake `fetch` is injected into the Anthropic SDK
 * client via its documented `fetch` client option, so this suite proves the failure
 * classification and retry-once behaviour without a provider configured, exactly as
 * §10.10's F2 acceptance requires ("originals and EXIF never leave the machine,
 * verified" for images; here, no network call happens at all for the failure paths).
 */
import { AnthropicProviderAdapter, type ProviderRequest } from '../../src/agent/provider'
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function anthropicErrorBody(type: string, message: string): unknown {
  return { type: 'error', error: { type, message } }
}

function toolUseResponse(calls: { name: string; input: unknown }[]): Record<string, unknown> {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: calls.map((c, i) => ({ type: 'tool_use', id: `toolu_${i}`, name: c.name, input: c.input })),
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 }
  }
}

// ---------------------------------------------------------------------------
// 1. no-key: short-circuits, never calls fetch
// ---------------------------------------------------------------------------

{
  let called = false
  const adapter = new AnthropicProviderAdapter({ fetch: async () => { called = true; return jsonResponse(200, {}) } })
  const result = await adapter.run(REQUEST)
  eq(result.ok, false, 'no-key: fails')
  ok(!result.ok && result.reason === 'no-key', 'no-key: reason is no-key')
  ok(!called, 'no-key: never calls fetch at all')
}

// ---------------------------------------------------------------------------
// 2. bad-key: 401 → bad-key, no retry (not transient)
// ---------------------------------------------------------------------------

{
  let calls = 0
  const adapter = new AnthropicProviderAdapter({
    apiKey: 'sk-bad',
    fetch: async () => { calls++; return jsonResponse(401, anthropicErrorBody('authentication_error', 'invalid x-api-key')) }
  })
  const result = await adapter.run(REQUEST)
  eq(result.ok, false, 'bad-key: fails')
  ok(!result.ok && result.reason === 'bad-key', 'bad-key: reason is bad-key')
  ok(!result.ok && result.message.length > 0, 'bad-key: has a caregiver-facing message')
  eq(calls, 1, 'bad-key: not retried (a 401 is not transient)')
}

// ---------------------------------------------------------------------------
// 3. rate-limited: 429 → rate-limited, and IS retried once
// ---------------------------------------------------------------------------

{
  let calls = 0
  const adapter = new AnthropicProviderAdapter({
    apiKey: 'sk-test',
    fetch: async () => { calls++; return jsonResponse(429, anthropicErrorBody('rate_limit_error', 'rate limited')) }
  })
  const result = await adapter.run(REQUEST)
  eq(result.ok, false, 'rate-limited: fails')
  ok(!result.ok && result.reason === 'rate-limited', 'rate-limited: reason is rate-limited')
  eq(calls, 2, 'rate-limited: retried exactly once (2 attempts total)')
}

// ---------------------------------------------------------------------------
// 4. timeout: aborts under a short client timeout, retried, still fails gracefully
// ---------------------------------------------------------------------------

{
  let calls = 0
  const neverRespond = (): Promise<Response> =>
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new DOMException('The operation was aborted.', 'AbortError')), 5)
    })
  const adapter = new AnthropicProviderAdapter({
    apiKey: 'sk-test',
    timeoutMs: 1,
    fetch: async () => { calls++; return neverRespond() }
  })
  const result = await adapter.run(REQUEST)
  eq(result.ok, false, 'timeout: fails')
  ok(!result.ok && (result.reason === 'timeout' || result.reason === 'network'), 'timeout: classified as timeout or network (both transient)')
  eq(calls, 2, 'timeout: retried exactly once')
}

// ---------------------------------------------------------------------------
// 5. malformed response: tool_use stop_reason with no tool_use blocks
// ---------------------------------------------------------------------------

{
  const adapter = new AnthropicProviderAdapter({
    apiKey: 'sk-test',
    fetch: async () => jsonResponse(200, { ...toolUseResponse([]), content: [{ type: 'text', text: 'oops' }] })
  })
  const result = await adapter.run(REQUEST)
  eq(result.ok, false, 'malformed: fails')
  ok(!result.ok && result.reason === 'malformed-response', 'malformed: reason is malformed-response')
}

// ---------------------------------------------------------------------------
// 6. success path returns typed tool calls
// ---------------------------------------------------------------------------

{
  const adapter = new AnthropicProviderAdapter({
    apiKey: 'sk-test',
    fetch: async () => jsonResponse(200, toolUseResponse([{ name: 'request_caregiver_input', input: { field: 'people[0].name', why: 'unknown' } }]))
  })
  const result = await adapter.run(REQUEST)
  eq(result.ok, true, 'success: ok')
  ok(result.ok && result.toolCalls.length === 1 && result.toolCalls[0].tool === 'request_caregiver_input', 'success: returns the tool call')
}

// ---------------------------------------------------------------------------
// 7. provider selection — stub is the default, never touches the network
// ---------------------------------------------------------------------------

{
  eq(DEFAULT_AGENT_CONFIG.provider, 'stub', 'config: stub is the default provider')
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

  const realAdapter = selectProvider({ ...DEFAULT_AGENT_CONFIG, provider: 'anthropic' })
  ok(realAdapter instanceof AnthropicProviderAdapter, 'selectProvider: "anthropic" selects the real adapter')
}

// ---------------------------------------------------------------------------
// 8. config parsing — malformed/hand-edited storage never silently enables the agent
// ---------------------------------------------------------------------------

{
  eq(parseAgentConfig(null).enabled, false, 'config: null input falls back to the safe default')
  eq(parseAgentConfig('garbage').enabled, false, 'config: a non-object falls back to the safe default')
  eq(parseAgentConfig({ enabled: 'yes' as unknown }).enabled, false, 'config: a wrong-typed field falls back rather than coercing')
  eq(parseAgentConfig({ provider: 'openai' }).provider, 'stub', 'config: an unrecognised provider falls back to stub')
  const good: AgentConfig = { ...DEFAULT_AGENT_CONFIG, enabled: true, provider: 'anthropic', consentGiven: true }
  eq(parseAgentConfig(good).enabled, true, 'config: a well-formed object round-trips')
}

// ---------------------------------------------------------------------------
// 9. consent — gates the first call, declining changes nothing else
// ---------------------------------------------------------------------------

{
  let asked = 0
  const notYetConsented: AgentConfig = { ...DEFAULT_AGENT_CONFIG, enabled: true, provider: 'anthropic' }
  const declined = await ensureConsent(notYetConsented, async (prompt) => {
    asked++
    eq(prompt, CONSENT_PROMPT, 'consent: the dialog is shown the §10.6 prompt content')
    return false
  })
  eq(asked, 1, 'consent: asks exactly once when not yet given')
  eq(declined.allowed, false, 'consent: declining is not allowed')
  eq(declined.config.enabled, true, 'consent: declining does not touch unrelated config fields')
  eq(declined.config.provider, 'anthropic', 'consent: declining does not force provider back to none')
  eq(declined.config.consentGiven, false, 'consent: declining leaves consentGiven false')

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
    modelId: 'claude-opus-5',
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
