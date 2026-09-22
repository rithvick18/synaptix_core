/**
 * Headless checks for Checkpoint F1 — the agent scaffolding. No provider, no network:
 * this file only exercises `src/agent/tools.ts`, `src/agent/tokens.ts`,
 * `src/agent/firewall.ts` and `src/agent/stubModel.ts` against fixtures.
 *
 * Checkpoint F4 added the section at the bottom, which explicitly loads
 * `DEFAULT_AGENT_CONFIG` (`enabled: false`, the shipped default) and re-runs the
 * firewall and token builder under it — proving §10.9's "the entire feature is inert"
 * is true of the actual functions, not just asserted in a comment. The firewall itself
 * takes no config (it is a pure function of a proposal and a context — §10.3), so
 * "with the agent disabled" here means: these results do not change based on
 * `agent.enabled`, because nothing in the call ever reads it.
 */
import { AGENT_TOOL_SCHEMA } from '../../src/agent/tools'
import { validateProposal } from '../../src/agent/firewall'
import { buildAllowedTokens } from '../../src/agent/tokens'
import { StubModel, type StubModelScript } from '../../src/agent/stubModel'
import { PROPOSAL_FIXTURES } from '../../src/agent/__fixtures__/proposals.fixtures'
import { DEFAULT_AGENT_CONFIG } from '../../src/agent/config'
import { ENVIRONMENT_TOOL, validateEnvironment } from '../../src/agent/environment'
import { proposalTools } from '../../src/agent/grammar'

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

// ---------------------------------------------------------------------------
// 1. The tool schema — commitProposal/rejectProposal must be unreachable
// ---------------------------------------------------------------------------

{
  const names = AGENT_TOOL_SCHEMA.map((t) => t.name)
  ok(!names.includes('commitProposal'), 'schema: commitProposal is absent')
  ok(!names.includes('rejectProposal'), 'schema: rejectProposal is absent')
  ok(names.includes('request_caregiver_input'), 'schema: request_caregiver_input is present (the escape hatch)')
  const expectedReadTools = [
    'list_rooms', 'list_anchors', 'list_interactables', 'list_assets',
    'get_caregiver_text', 'get_pack_draft'
  ]
  for (const t of expectedReadTools) ok(names.includes(t), `schema: read tool "${t}" is present`)
  const expectedProposeTools = [
    'propose_photo_placement', 'propose_person', 'propose_navigate_step',
    'propose_find_step', 'propose_recall_step', 'propose_level'
  ]
  for (const t of expectedProposeTools) ok(names.includes(t), `schema: proposal tool "${t}" is present`)
  eq(new Set(names).size, names.length, 'schema: no duplicate tool names')
}

// ---------------------------------------------------------------------------
// 2. Token builder — deterministic, caregiver-only, nothing image-derived
// ---------------------------------------------------------------------------

{
  const tokens = buildAllowedTokens({
    texts: ['Ananya is my granddaughter, visiting at Bihu in 2019.'],
    fields: ['Mira']
  })
  ok(tokens.has('Ananya'), 'tokens: a name in caregiver text is allowed')
  ok(tokens.has('Bihu'), 'tokens: an event name in caregiver text is allowed')
  ok(tokens.has('2019'), 'tokens: a year the caregiver typed is allowed')
  ok(tokens.has('Mira'), 'tokens: a typed form field is allowed')
  ok(!tokens.has('Devika'), 'tokens: a name never supplied is not allowed')

  const again = buildAllowedTokens({
    texts: ['Ananya is my granddaughter, visiting at Bihu in 2019.'],
    fields: ['Mira']
  })
  eq([...tokens].sort().join(','), [...again].sort().join(','), 'tokens: deterministic for the same input')
}

// ---------------------------------------------------------------------------
// 3. The firewall against every fixture
// ---------------------------------------------------------------------------

ok(PROPOSAL_FIXTURES.length >= 20, `fixtures: at least 20 proposals present (found ${PROPOSAL_FIXTURES.length})`)

const rulesSeen = new Set<string>()

for (const fixture of PROPOSAL_FIXTURES) {
  const result = validateProposal(fixture.proposal, fixture.context)
  eq(result.ok, fixture.expectOk, `${fixture.name}: ok === ${fixture.expectOk}`)
  if (fixture.expectOk) {
    eq(result.violations.length, 0, `${fixture.name}: no violations`)
  } else {
    ok(result.violations.length > 0, `${fixture.name}: at least one violation`)
  }
  for (const rule of fixture.expectRules) {
    ok(
      result.violations.some((v) => v.rule === rule),
      `${fixture.name}: reports ${rule}`
    )
    rulesSeen.add(rule)
  }
  // Every violation names the offending token and a human-readable message — the
  // rejection screen (§10.3) has nothing to show otherwise.
  for (const v of result.violations) {
    ok(v.token.length > 0, `${fixture.name}: violation ${v.rule} names a token`)
    ok(v.message.length > 5, `${fixture.name}: violation ${v.rule} has a readable message`)
  }
}

for (const rule of ['F-a', 'F-b', 'F-c', 'F-d', 'F-e', 'F-f', 'F-g', 'F-h', 'F-i']) {
  ok(rulesSeen.has(rule), `fixtures: rule ${rule} is exercised by at least one fixture`)
}

// ---------------------------------------------------------------------------
// 4. Purity — same proposal, same context, same result (no hidden state/clock/random)
// ---------------------------------------------------------------------------

{
  const fixture = PROPOSAL_FIXTURES.find((f) => f.name.startsWith('F-a:'))!
  const first = validateProposal(fixture.proposal, fixture.context)
  const second = validateProposal(fixture.proposal, fixture.context)
  eq(first.ok, second.ok, 'firewall: repeated calls agree on ok')
  eq(
    first.violations.map((v) => v.rule + v.token).join(','),
    second.violations.map((v) => v.rule + v.token).join(','),
    'firewall: repeated calls produce identical violations'
  )
}

// ---------------------------------------------------------------------------
// 5. The stub model — offline, scripted, produces the proposals it was told to
// ---------------------------------------------------------------------------

{
  const script: StubModelScript = {
    name: 'water-mission-draft',
    calls: [
      {
        tool: 'propose_navigate_step',
        args: {
          targetRoom: 'kitchen',
          instruction: 'Please go to the kitchen.',
          hints: { repeat: 'Please go to the kitchen.', highlight: 'kitchenDoor', guide: 'Through this door.' }
        }
      },
      {
        tool: 'request_caregiver_input',
        args: { field: 'people[0].name', why: 'No name was supplied for the person in this photo.' }
      }
    ]
  }
  const results = new StubModel(script).run()
  eq(results.length, 2, 'stubModel: replays every scripted call')
  eq(results[0].kind, 'navigate_step', 'stubModel: first call produced a navigate_step proposal')
  eq(results[1].kind, 'caregiver_input_request', 'stubModel: second call produced a caregiver-input request')
  ok(
    results.every((r) => typeof r.proposalId === 'string' && r.proposalId.length > 0),
    'stubModel: every result carries a proposal id'
  )
}

// ---------------------------------------------------------------------------
// 6. §10.9 — the shipped default is `enabled: false`, and the firewall/tokens are
//    unaffected by it either way (Checkpoint F4)
// ---------------------------------------------------------------------------

{
  eq(DEFAULT_AGENT_CONFIG.enabled, false, '§10.9 default config: enabled is false — the shipped default')
  eq(DEFAULT_AGENT_CONFIG.consentGiven, false, '§10.9 default config: no consent is pre-granted')

  const fixture = PROPOSAL_FIXTURES.find((f) => f.name.startsWith('F-a:'))!
  const withAgentDisabled = validateProposal(fixture.proposal, fixture.context)
  eq(withAgentDisabled.ok, fixture.expectOk, '§10.9 firewall: unaffected by agent.enabled — same result with the agent off')

  const tokensWithAgentDisabled = buildAllowedTokens({ texts: ['Ananya visited.'], fields: [] })
  ok(tokensWithAgentDisabled.has('Ananya'), '§10.9 tokens: the builder works identically whether or not agent.enabled is true')
}

// ---------------------------------------------------------------------------
// 7. §11.7 — the agent does not choose or propose a template
//
// Guessing a home's layout from its photographs is guessing a fact about the home
// (§10.4). These are every tool a model is ever handed — the authoring run's
// `proposalTools()` is drawn from `AGENT_TOOL_SCHEMA`, the environment run's only tool is
// `ENVIRONMENT_TOOL` — so no name, description or parameter in them may reach the house.
// ---------------------------------------------------------------------------

{
  const reachable = [...AGENT_TOOL_SCHEMA, ...proposalTools(), ENVIRONMENT_TOOL]
  const house = /template|mirror|layout|floor ?plan/i
  for (const tool of reachable) {
    ok(!house.test(JSON.stringify(tool)), `§11.7 tool "${tool.name}" has no template, mirror or layout field or wording`)
  }
  ok(!reachable.some((t) => /template|layout/i.test(t.name)), '§11.7 no tool is named for templates or layouts')

  // And the environment result is filtered to its own keys: a model that returned a
  // layout anyway could not have it reach the profile.
  const smuggled = validateEnvironment({
    wall: '#aabbcc', floor: '#aabbcc', wood: '#aabbcc', fabric: '#aabbcc', accent: '#aabbcc',
    floorType: 'wood', light: 'warm', templateId: 'courtyard', mirrored: true
  }) as unknown as Record<string, unknown>
  ok(!('templateId' in smuggled) && !('mirrored' in smuggled), '§11.7 set_environment output drops templateId and mirrored')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
