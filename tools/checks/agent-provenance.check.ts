/**
 * Headless checks for Checkpoint F4 — the provenance block (§10.8) and its plumbing
 * into the session export. Session telemetry itself (§4.4) is unchanged; this suite
 * proves that fact directly by comparing an export built with a provenance block
 * against one built without — everything except the `provenance` field must be
 * byte-identical in shape.
 */
import { computeProvenance } from '../../src/agent/provenance'
import { ReviewSession } from '../../src/agent/review'
import { buildAllowedTokens } from '../../src/agent/tokens'
import type { FirewallContext } from '../../src/agent/firewall'
import { propose_find_step, propose_navigate_step, resetProposalIds, type Proposal } from '../../src/agent/tools'
import { buildExport, type Event } from '../../src/Telemetry'

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

function ctx(): FirewallContext {
  return {
    allowedTokens: buildAllowedTokens({ texts: [], fields: [] }),
    world: { rooms: new Set(['kitchen']), interactables: new Set(['water-jug']), hintTargets: new Set(['kitchenDoor', 'water-jug']), anchors: new Map() },
    assets: new Map(),
    people: new Set()
  }
}

// ---------------------------------------------------------------------------
// 1. computeProvenance reads straight off ReviewSession.counts() — one source of truth
// ---------------------------------------------------------------------------

resetProposalIds()
{
  const session = new ReviewSession(ctx())
  const a = propose_navigate_step({ targetRoom: 'kitchen', instruction: 'Please go to the kitchen.', hints: { repeat: 'x', highlight: 'kitchenDoor', guide: 'x' } })
  const b = propose_find_step({ targetObject: 'water-jug', instruction: 'Find the jug.', hints: { repeat: 'x', highlight: 'water-jug', guide: 'x' } })
  session.ingest([a, b])
  session.edit(a.proposalId, { instruction: 'Please walk to the kitchen.' } as Partial<Proposal>)
  session.commit(a.proposalId)
  session.reject(b.proposalId)

  const provenance = computeProvenance(session.counts(), 'claude-opus-5', 'f-1', 'caregiver', '2026-09-20T09:14:00Z')
  eq(provenance.agentAssisted, true, 'provenance: agentAssisted is always true when this block exists at all')
  eq(provenance.model, 'claude-opus-5', 'provenance: carries the model id')
  eq(provenance.promptVersion, 'f-1', 'provenance: carries the prompt version')
  eq(provenance.proposals.accepted, 0, 'provenance: accepted count matches the session')
  eq(provenance.proposals.edited, 1, 'provenance: edited count matches the session')
  eq(provenance.proposals.rejected, 1, 'provenance: rejected count matches the session')
  eq(provenance.proposals.firewallRejected, 0, 'provenance: firewallRejected count matches the session')
  eq(provenance.confirmedBy, 'caregiver', 'provenance: records who confirmed it')
  eq(provenance.confirmedAt, '2026-09-20T09:14:00Z', 'provenance: records when')
}

// ---------------------------------------------------------------------------
// 2. buildExport: identical shape with and without provenance, except the field itself
// ---------------------------------------------------------------------------

{
  const events: Event[] = [
    { t: 0, kind: 'mission_start', id: 'water' },
    { t: 1000, kind: 'mission_complete', id: 'water' }
  ]
  const baseContext = {
    patientId: 'mira', levelId: 'water', levelIndex: 0, levelTitle: 'A glass of water',
    attemptId: 'attempt-1', attemptNumber: 1, restarts: 0,
    world: { templateId: 'hallway', mirrored: false, templateVersion: 1 }
  }
  const withoutProvenance = buildExport(events, baseContext)
  const provenance = computeProvenance({ accepted: 3, edited: 1, rejected: 0, firewallRejected: 2, caregiverInputRequests: 4 }, 'claude-opus-5', 'f-1')
  const withProvenance = buildExport(events, { ...baseContext, provenance })

  ok(!('provenance' in withoutProvenance), 'export: a hand-authored pack\'s export has no provenance field at all')
  ok('provenance' in withProvenance && withProvenance.provenance?.agentAssisted === true, 'export: an agent-assisted pack\'s export carries the block')

  const { provenance: _p1, generatedAt: _g1, ...rest1 } = withoutProvenance
  const { provenance: _p2, generatedAt: _g2, ...rest2 } = withProvenance
  eq(JSON.stringify(rest1), JSON.stringify(rest2), 'export: session telemetry is IDENTICAL in shape whether or not provenance is present — §4.4 is untouched')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
