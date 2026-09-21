/**
 * Headless checks for the local-model path: the GBNF grammar (`src/agent/grammar.ts`)
 * and the llama.cpp provider adapter (`src/agent/llamaCpp.ts`).
 *
 * No real network. Every adapter test injects a `fetch` that returns a constructed
 * `Response` or throws a constructed error, so the whole failure taxonomy — server down,
 * no model loaded, timeout, rejected key, malformed answer — is exercised without a
 * `llama-server` anywhere near the machine running `npm run check`.
 */
import { buildProposalGrammar, parseProposalCalls, proposalTools } from '../../src/agent/grammar'
import { AGENT_TOOL_SCHEMA } from '../../src/agent/tools'
import {
  DEFAULT_LLAMACPP_ENDPOINT,
  LlamaCppProviderAdapter,
  isLoopbackEndpoint
} from '../../src/agent/llamaCpp'
import { consentPromptFor, DEFAULT_AGENT_CONFIG, type AgentConfig } from '../../src/agent/config'
import { selectProvider } from '../../src/agent/selectProvider'
import type { ProviderRequest } from '../../src/agent/provider'

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

function request(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    systemPrompt: 'system',
    tools: AGENT_TOOL_SCHEMA,
    caregiverText: 'Ananya is my granddaughter.',
    probeImages: [],
    ...overrides
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function completion(content: string): Record<string, unknown> {
  return { model: 'test-model', choices: [{ message: { role: 'assistant', content } }] }
}

// ---------------------------------------------------------------------------
// 1. The grammar — what a model is allowed to emit at all
// ---------------------------------------------------------------------------

{
  const grammar = buildProposalGrammar()

  ok(grammar.includes('root ::='), 'grammar: has a root rule')
  ok(!grammar.includes('commitProposal'), 'grammar: commitProposal is unrepresentable (§10.2)')
  ok(!grammar.includes('rejectProposal'), 'grammar: rejectProposal is unrepresentable (§10.2)')

  // Read tools resolve into the prompt, so a model is never asked to call one — and a
  // grammar that allowed it would let a small model burn its one turn asking questions
  // whose answers it already has.
  for (const readTool of ['list_rooms', 'list_anchors', 'list_interactables', 'list_assets', 'get_caregiver_text', 'get_pack_draft']) {
    ok(!grammar.includes(readTool), `grammar: read tool "${readTool}" is not emittable`)
  }

  for (const proposeTool of [
    'propose_photo_placement', 'propose_person', 'propose_navigate_step',
    'propose_find_step', 'propose_recall_step', 'propose_level', 'request_caregiver_input'
  ]) {
    ok(grammar.includes(proposeTool), `grammar: "${proposeTool}" is emittable`)
  }

  eq(proposalTools().length, 7, 'grammar: exactly the seven emittable tools')

  // Every rule referenced must be defined, or llama.cpp rejects the whole grammar at
  // load time and the feature is dead on arrival with no useful error.
  const defined = new Set<string>()
  const referenced = new Set<string>()
  for (const line of grammar.split('\n')) {
    const match = /^([a-z0-9-]+) ::= (.*)$/.exec(line)
    if (!match) continue
    defined.add(match[1])
    // Strip quoted literals and character classes first: their contents are terminals,
    // not rule references, and splitting them on punctuation invents names like "asset".
    const body = match[2].replace(/"(?:\\.|[^"\\])*"/g, ' ').replace(/\[[^\]]*\]/g, ' ')
    for (const token of body.split(/[^a-z0-9-]+/)) {
      if (token && /^[a-z][a-z0-9-]*$/.test(token)) referenced.add(token)
    }
  }
  ok(defined.has('root'), 'grammar: root is defined')
  const undefinedRules = [...referenced].filter((r) => !defined.has(r))
  eq(undefinedRules.join(','), '', 'grammar: every referenced rule is defined')

  // The schema's own shapes have to survive into the grammar, or the model is free to
  // omit a field the firewall then blames it for.
  ok(grammar.includes('"\\"reducedChoices\\""'), 'grammar: recall steps must carry reducedChoices')
  ok(grammar.includes('"\\"highlight\\""'), 'grammar: hints must carry a highlight target')
}

// ---------------------------------------------------------------------------
// 2. Reading grammar-constrained output back
// ---------------------------------------------------------------------------

{
  const good = JSON.stringify([
    { tool: 'request_caregiver_input', args: { field: 'people[0].name', why: 'No name was given.' } }
  ])
  const parsed = parseProposalCalls(good)
  ok(parsed !== null, 'parse: a valid call list parses')
  eq(parsed?.length, 1, 'parse: one call')
  eq(parsed?.[0].tool, 'request_caregiver_input', 'parse: the tool name survives')

  eq(parseProposalCalls('not json'), null, 'parse: prose is rejected, not guessed at')
  eq(parseProposalCalls('{"tool":"propose_person"}'), null, 'parse: a bare object is rejected (must be a list)')
  eq(
    parseProposalCalls(JSON.stringify([{ tool: 'commitProposal', args: {} }])),
    null,
    'parse: commitProposal is refused even if a provider somehow emits it (§10.2)'
  )
  eq(
    parseProposalCalls(JSON.stringify([{ tool: 'list_rooms', args: {} }])),
    null,
    'parse: a read tool is not an acceptable output'
  )
  eq(parseProposalCalls(JSON.stringify([{ tool: 'propose_person', args: null }])), null, 'parse: null args rejected')
  eq(parseProposalCalls('[]')?.length, 0, 'parse: an empty list is valid — the model proposed nothing')
}

// ---------------------------------------------------------------------------
// 3. Loopback detection — what the consent dialog is allowed to promise
// ---------------------------------------------------------------------------

{
  ok(isLoopbackEndpoint('http://127.0.0.1:8080'), 'loopback: 127.0.0.1')
  ok(isLoopbackEndpoint('http://localhost:8080'), 'loopback: localhost')
  ok(isLoopbackEndpoint('http://127.5.2.1:1234'), 'loopback: all of 127/8')
  ok(isLoopbackEndpoint('http://[::1]:8080'), 'loopback: IPv6 ::1')
  ok(!isLoopbackEndpoint('http://192.168.1.4:8080'), 'loopback: a LAN address is NOT loopback')
  ok(!isLoopbackEndpoint('https://example.com'), 'loopback: a public host is NOT loopback')
  ok(!isLoopbackEndpoint('not a url'), 'loopback: an unparseable endpoint is NOT assumed local')
  ok(isLoopbackEndpoint(DEFAULT_LLAMACPP_ENDPOINT), 'loopback: the shipped default is local')
}

{
  const local: AgentConfig = { ...DEFAULT_AGENT_CONFIG, provider: 'llamacpp', endpoint: '' }
  const localPrompt = consentPromptFor(local)
  ok(
    localPrompt.sent.some((s) => s.includes('same computer')),
    'consent: a loopback local model tells the caregiver it stays on the machine'
  )
  ok(
    localPrompt.notSent.some((s) => s.toLowerCase().includes('anthropic')),
    'consent: a local model explicitly says nothing goes to a company'
  )

  const remote: AgentConfig = { ...DEFAULT_AGENT_CONFIG, provider: 'llamacpp', endpoint: 'http://192.168.1.4:8080' }
  const remotePrompt = consentPromptFor(remote)
  ok(
    remotePrompt.sent.some((s) => s.includes('leave this machine')),
    'consent: a non-loopback endpoint admits the photos leave the machine'
  )

  const hosted: AgentConfig = { ...DEFAULT_AGENT_CONFIG, provider: 'anthropic' }
  eq(consentPromptFor(hosted).provider, 'Anthropic', 'consent: the hosted provider keeps its own copy')
}

// ---------------------------------------------------------------------------
// 4. The adapter's success path
// ---------------------------------------------------------------------------

{
  let captured: { url: string; body: Record<string, unknown> } | null = null
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body)) }
    return jsonResponse(
      completion(JSON.stringify([
        { tool: 'propose_navigate_step', args: { targetRoom: 'kitchen', instruction: 'Please go to the kitchen.', hints: { repeat: 'r', highlight: 'kitchenDoor', guide: 'g' } } }
      ]))
    )
  }) as unknown as typeof fetch

  const adapter = new LlamaCppProviderAdapter({ fetch: fakeFetch })
  const result = await adapter.run(
    request({ probeImages: [{ assetId: 'asset-1', mimeType: 'image/jpeg', base64: 'AAAA' }] })
  )

  ok(result.ok, 'adapter: a well-formed answer succeeds')
  if (result.ok) {
    eq(result.toolCalls.length, 1, 'adapter: one tool call came back')
    eq(result.toolCalls[0].tool, 'propose_navigate_step', 'adapter: the tool name came back')
    eq(result.model, 'test-model', 'adapter: the served model name is recorded for provenance')
  }

  const sent = captured as unknown as { url: string; body: Record<string, unknown> }
  eq(sent.url, 'http://127.0.0.1:8080/v1/chat/completions', 'adapter: posts to the OpenAI-compatible path on loopback')
  ok(typeof sent.body.grammar === 'string' && (sent.body.grammar as string).includes('root ::='), 'adapter: sends a GBNF grammar')
  ok(!(sent.body.grammar as string).includes('commitProposal'), 'adapter: the grammar it sends cannot express commitProposal')
  eq(sent.body.stream, false, 'adapter: does not stream (the caller wants one complete answer)')

  // §10.5 rule 4: only the probe leaves. The request body must carry exactly the probe
  // bytes handed in, and nothing resembling an original file.
  const messages = sent.body.messages as { role: string; content: unknown }[]
  const userContent = messages[1].content as { type: string; image_url?: { url: string } }[]
  const images = userContent.filter((c) => c.type === 'image_url')
  eq(images.length, 1, 'adapter: exactly one image was sent for one upload')
  eq(images[0].image_url?.url, 'data:image/jpeg;base64,AAAA', 'adapter: the probe base64 is what was transmitted')
  eq(JSON.stringify(sent.body).includes('EXIF'), false, 'adapter: nothing EXIF-shaped rides along')
}

// ---------------------------------------------------------------------------
// 5. Every failure path returns to manual authoring with a readable message
// ---------------------------------------------------------------------------

async function failureOf(fakeFetch: typeof fetch, label: string): Promise<{ reason: string; message: string }> {
  const adapter = new LlamaCppProviderAdapter({ fetch: fakeFetch, timeoutMs: 20 })
  const result = await adapter.run(request())
  if (result.ok) {
    failures.push(`${label}: expected a failure, got success`)
    checks++
    return { reason: 'ok', message: '' }
  }
  checks++
  return { reason: result.reason, message: result.message }
}

{
  const refused = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  const down = await failureOf(refused, 'server down')
  eq(down.reason, 'network', 'failure: a refused connection reads as network')
  ok(down.message.includes('llama-server'), 'failure: the message names llama-server, which is the thing to start')
  ok(down.message.includes('by hand'), 'failure: and offers manual authoring (§10.9)')
}

{
  const noModel = (async () => jsonResponse({ error: 'no model' }, 503)) as unknown as typeof fetch
  const result = await failureOf(noModel, 'no model loaded')
  eq(result.reason, 'model-unavailable', 'failure: 503 reads as no model loaded')
  ok(result.message.includes('by hand'), 'failure: no-model still offers manual authoring')
}

{
  const badKey = (async () => jsonResponse({ error: 'unauthorized' }, 401)) as unknown as typeof fetch
  eq((await failureOf(badKey, 'bad key')).reason, 'bad-key', 'failure: 401 reads as a rejected key')
}

{
  const busy = (async () => jsonResponse({ error: 'busy' }, 429)) as unknown as typeof fetch
  eq((await failureOf(busy, 'rate limited')).reason, 'rate-limited', 'failure: 429 reads as busy')
}

{
  // A server that ignores `grammar` returns prose. That must not be smuggled through as
  // if it were proposals — this is the case the grammar exists to prevent, and the
  // adapter still has to behave when the grammar was not applied.
  const prose = (async () =>
    jsonResponse(completion('Certainly! Here are some lovely ideas for your grandmother.'))) as unknown as typeof fetch
  const result = await failureOf(prose, 'unconstrained prose')
  eq(result.reason, 'malformed-response', 'failure: prose is refused, never parsed optimistically')
}

{
  const empty = (async () => jsonResponse({ choices: [] })) as unknown as typeof fetch
  eq((await failureOf(empty, 'no choices')).reason, 'malformed-response', 'failure: an empty choices array is malformed')
}

{
  const notJson = (async () => new Response('<html>502</html>', { status: 200 })) as unknown as typeof fetch
  eq((await failureOf(notJson, 'not json')).reason, 'malformed-response', 'failure: a non-JSON 200 is malformed')
}

{
  // The adapter aborts via AbortController; a fetch that never settles must surface as a
  // timeout rather than hanging the caregiver's screen forever.
  const hangs = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })) as unknown as typeof fetch
  const result = await failureOf(hangs, 'timeout')
  eq(result.reason, 'timeout', 'failure: a hanging server times out')
  ok(result.message.includes('retry'), 'failure: a timeout suggests retrying')
}

// ---------------------------------------------------------------------------
// 6. Retry-once, and only for transient reasons
// ---------------------------------------------------------------------------

{
  let attempts = 0
  const flaky = (async () => {
    attempts += 1
    if (attempts === 1) throw new TypeError('fetch failed')
    return jsonResponse(completion('[]'))
  }) as unknown as typeof fetch

  const result = await new LlamaCppProviderAdapter({ fetch: flaky }).run(request())
  eq(attempts, 2, 'retry: a transient network failure is retried exactly once')
  ok(result.ok, 'retry: the second attempt is what the caller sees')
}

{
  let attempts = 0
  const alwaysBad = (async () => {
    attempts += 1
    return jsonResponse({ error: 'unauthorized' }, 401)
  }) as unknown as typeof fetch

  await new LlamaCppProviderAdapter({ fetch: alwaysBad }).run(request())
  eq(attempts, 1, 'retry: a rejected key is NOT retried — retrying cannot fix it')
}

// ---------------------------------------------------------------------------
// 7. Health probe, and selection by config
// ---------------------------------------------------------------------------

{
  const healthy = (async () => new Response('{"status":"ok"}', { status: 200 })) as unknown as typeof fetch
  const up = await new LlamaCppProviderAdapter({ fetch: healthy }).health()
  ok(up.ok, 'health: a running server reports ready')

  const down = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  const result = await new LlamaCppProviderAdapter({ fetch: down }).health()
  ok(!result.ok, 'health: a stopped server reports not ready')
  ok(result.message.includes('llama-server'), 'health: and says what to start')
}

{
  const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG, provider: 'llamacpp', endpoint: 'http://127.0.0.1:9999' }
  let seen = ''
  const spy = (async (url: string | URL | Request) => {
    seen = String(url)
    return jsonResponse(completion('[]'))
  }) as unknown as typeof fetch

  const adapter = selectProvider(config, { llamacpp: { fetch: spy } })
  await adapter.run(request())
  eq(seen, 'http://127.0.0.1:9999/v1/chat/completions', 'selectProvider: honours the configured endpoint')
}

{
  eq(DEFAULT_AGENT_CONFIG.provider, 'stub', 'config: the stub is still the default provider, not a real one')
  eq(DEFAULT_AGENT_CONFIG.enabled, false, 'config: the feature is still off by default (§10.9)')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
