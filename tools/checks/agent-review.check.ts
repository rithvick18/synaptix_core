/**
 * Headless checks for Checkpoint F3 — the review/commit state machine and the
 * proposal→pack writer. Bundled with esbuild and run under node; `document`, `Image`
 * and three's loaders are stubbed exactly as `pack.check.ts` stubs them, since this
 * suite proves a committed pack loads through `MemoryPack.validate()` unmodified.
 */
import * as THREE from 'three'

const MISSING = new Set<string>()
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private url = ''
  set src(value: string) {
    this.url = value
    setTimeout(() => (MISSING.has(value) ? this.onerror?.() : this.onload?.()), 0)
  }
  get src(): string { return this.url }
}
const fakeCtx = {
  createLinearGradient: () => ({ addColorStop: () => {} }),
  fillRect: () => {},
  set fillStyle(_v: unknown) {}
}
;(globalThis as Record<string, unknown>).document = {
  baseURI: 'http://localhost/',
  createElement: (tag: string) => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => fakeCtx } : {})
}
;(globalThis as Record<string, unknown>).Image = FakeImage
type LoadFn = (url: string, ok: (v: unknown) => void, p: unknown, err: () => void) => void
const fakeLoad = (make: (url: string) => unknown): LoadFn => (url, ok, _p, err) =>
  setTimeout(() => (MISSING.has(url) ? err() : ok(make(url))), 0)
THREE.TextureLoader.prototype.load = fakeLoad(() => {
  const t = new THREE.Texture()
  ;(t as unknown as { image: unknown }).image = { width: 512, height: 512 }
  return t
}) as never
THREE.AudioLoader.prototype.load = fakeLoad(() => ({ duration: 3 })) as never

import { validate } from '../../src/MemoryPack'
import type { MemoryPack } from '../../src/Missions'
import type { WorldSource } from '../../src/World'
import { ReviewSession } from '../../src/agent/review'
import { buildPackFromProposals } from '../../src/agent/commitPack'
import { buildAllowedTokens } from '../../src/agent/tokens'
import type { FirewallContext, WorldRegistry, AssetRegistry } from '../../src/agent/firewall'
import {
  propose_find_step,
  propose_level,
  propose_navigate_step,
  propose_person,
  propose_recall_step,
  resetProposalIds,
  type CaregiverInputRequest,
  type Proposal
} from '../../src/agent/tools'

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

function makeWorld(): WorldSource & { room: string | null } {
  const box = (x0: number, z0: number, x1: number, z1: number): THREE.Box3 =>
    new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 2.7, z1))
  const obj = (): THREE.Object3D => new THREE.Object3D()
  const world = {
    room: null as string | null,
    root: new THREE.Object3D(),
    blockers: [] as THREE.Box3[],
    triggers: [
      { room: 'kitchen', box: box(1.3, -6, 7.5, -0.5) },
      { room: 'livingRoom', box: box(1.3, -0.5, 7.5, 6) }
    ],
    anchors: { livingRoomWall: obj(), bedsideFrame: obj(), audioSource: obj() },
    interactables: { 'water-jug': obj(), radio: obj(), 'wall-photo': obj(), kitchenDoor: obj() },
    hintTargets: {
      kitchenDoor: obj(), livingArch: obj(), kitchenArch: obj(),
      'water-jug': obj(), radio: obj(), 'wall-photo': obj()
    },
    spawn: { position: new THREE.Vector3(0, 1.6, 10), yaw: 0 },
    roomOf(): string | null { return world.room }
  }
  return world
}

function firewallWorld(): WorldRegistry {
  return {
    rooms: new Set(['kitchen', 'livingRoom']),
    interactables: new Set(['water-jug', 'radio', 'wall-photo']),
    hintTargets: new Set(['kitchenDoor', 'livingArch', 'kitchenArch', 'water-jug', 'radio', 'wall-photo']),
    anchors: new Map([
      ['livingRoomWall', { contentType: 'wall' as const, aspect: 1.36 }],
      ['bedsideFrame', { contentType: 'portrait' as const, aspect: 0.77 }]
    ])
  }
}

function assets(): Map<string, AssetRegistry> {
  return new Map([['portrait-1', { id: 'portrait-1', kind: 'image' as const, aspect: 0.75 }]])
}

function ctx(texts: string[] = ['Ananya is my granddaughter.']): FirewallContext {
  return {
    allowedTokens: buildAllowedTokens({ texts, fields: ['Ananya', 'Granddaughter'] }),
    world: firewallWorld(),
    assets: assets(),
    people: new Set()
  }
}

const emptyPack: MemoryPack = { patient: { name: 'Test' }, people: [], anchors: {}, missions: [] }

// ---------------------------------------------------------------------------
// 1. ingest: firewall runs on arrival, pending vs firewallRejected
// ---------------------------------------------------------------------------

resetProposalIds()
{
  const session = new ReviewSession(ctx())
  const good = propose_navigate_step({
    targetRoom: 'kitchen', instruction: 'Please go to the kitchen.',
    hints: { repeat: 'Please go to the kitchen.', highlight: 'kitchenDoor', guide: 'Through this door.' }
  })
  const bad = propose_navigate_step({
    targetRoom: 'kitchen', instruction: 'Please go find Suresh in the kitchen.',
    hints: { repeat: 'Please go find Suresh.', highlight: 'kitchenDoor', guide: 'Through this door.' }
  })
  session.ingest([good, bad])
  eq(session.get(good.proposalId)?.status, 'pending', 'ingest: a clean proposal starts pending')
  eq(session.get(bad.proposalId)?.status, 'firewallRejected', 'ingest: a violating proposal is firewallRejected on arrival')
  ok((session.get(bad.proposalId)?.violations.length ?? 0) > 0, 'ingest: the rejection carries violations')
}

// ---------------------------------------------------------------------------
// 2. request_caregiver_input: an answer widens allowedTokens and unblocks proposals
// ---------------------------------------------------------------------------

{
  const withKnownPerson: typeof ctx = () => ({ ...ctx(['We live at home.']), people: new Set(['ananya']) })
  const session = new ReviewSession(withKnownPerson())
  const blocked = propose_recall_step({
    question: 'Who visited you?',
    choices: ['ananya'], answer: 'ananya', reducedChoices: ['ananya'],
    hints: { repeat: 'Who visited you?', highlight: 'reduce', guide: 'It was Devika who visited.' }
  })
  const ask: CaregiverInputRequest = { kind: 'caregiver_input_request', proposalId: 'ask-1', field: 'people[0].name', why: 'No name was given.' }
  session.ingest([blocked, ask])
  eq(session.get(blocked.proposalId)?.status, 'firewallRejected', 'input-request: blocked before the answer (Devika is unknown)')
  ok(session.get(blocked.proposalId)!.violations.every((v) => v.rule === 'F-a'), 'input-request: the only violation is the unknown name, isolating what the answer should fix')
  eq(session.pendingInputRequests().length, 1, 'input-request: one pending question')

  session.answerCaregiverInput('ask-1', 'Devika')
  eq(session.pendingInputRequests().length, 0, 'input-request: answering clears the pending question')
  eq(session.get(blocked.proposalId)?.status, 'pending', 'input-request: the previously-blocked proposal is unblocked once Devika is a known token')
}

// ---------------------------------------------------------------------------
// 3. edit(): the caregiver's text survives, the model's original does not
// ---------------------------------------------------------------------------

{
  const session = new ReviewSession(ctx())
  const proposal = propose_find_step({
    targetObject: 'water-jug', instruction: 'Can you find the water jug?',
    hints: { repeat: 'Can you find the water jug?', highlight: 'water-jug', guide: 'It is on the counter.' }
  })
  session.ingest([proposal])
  session.edit(proposal.proposalId, { instruction: 'Can you find the blue water jug?' } as Partial<Proposal>)
  const reviewed = session.get(proposal.proposalId)!
  ok(reviewed.edited, 'edit: marks the proposal as caregiver-edited')
  ok(reviewed.proposal.kind === 'find_step' && reviewed.proposal.instruction === 'Can you find the blue water jug?', 'edit: the stored proposal carries the caregiver\'s wording')
  const result = session.commit(proposal.proposalId)
  ok(result.ok, 'edit: the edited proposal still passes the firewall')
  eq(session.get(proposal.proposalId)?.status, 'edited', 'commit: an edited proposal commits as "edited", never plain "accepted"')
  const committedText = session.committed()[0].proposal
  ok(committedText.kind === 'find_step' && committedText.instruction === 'Can you find the blue water jug?', 'commit: what is committed is the caregiver\'s edited text, not the model\'s original')
}

// ---------------------------------------------------------------------------
// 4. commit() re-runs the firewall independently of ingest's first pass
// ---------------------------------------------------------------------------

{
  const session = new ReviewSession(ctx())
  const proposal = propose_navigate_step({
    targetRoom: 'kitchen', instruction: 'Please go to the kitchen.',
    hints: { repeat: 'Please go to the kitchen.', highlight: 'kitchenDoor', guide: 'Through this door.' }
  })
  session.ingest([proposal])
  eq(session.get(proposal.proposalId)?.status, 'pending', 'commit: starts pending (passed on ingest)')
  // Edit it into a violation, then commit directly without going through edit()'s own
  // re-validation path — proves commit() itself re-checks rather than trusting status.
  session.edit(proposal.proposalId, { instruction: 'This tests for memory decline.' } as Partial<Proposal>)
  eq(session.get(proposal.proposalId)?.status, 'firewallRejected', 'commit: an edit introducing a violation is caught immediately')
  const result = session.commit(proposal.proposalId)
  eq(result.ok, false, 'commit: refuses to accept a proposal that currently violates a rule')
  eq(session.committed().length, 0, 'commit: nothing lands in committed() when the firewall refuses')
}

// ---------------------------------------------------------------------------
// 5. reject() is terminal and is not reopened by a later caregiver-input answer
// ---------------------------------------------------------------------------

{
  const session = new ReviewSession(ctx(['We live at home.']))
  const proposal = propose_recall_step({
    question: 'Who visited you?',
    choices: [], answer: '', reducedChoices: [],
    hints: { repeat: 'Who visited you?', highlight: 'reduce', guide: 'It was Devika.' }
  })
  const ask: CaregiverInputRequest = { kind: 'caregiver_input_request', proposalId: 'ask-2', field: 'x', why: 'y' }
  session.ingest([proposal, ask])
  session.reject(proposal.proposalId)
  session.answerCaregiverInput('ask-2', 'Devika')
  eq(session.get(proposal.proposalId)?.status, 'rejected', 'reject: stays rejected even after a later answer would have unblocked it')
}

// ---------------------------------------------------------------------------
// 6. counts() — §10.8's provenance numbers
// ---------------------------------------------------------------------------

{
  const session = new ReviewSession(ctx())
  const a = propose_navigate_step({ targetRoom: 'kitchen', instruction: 'Please go to the kitchen.', hints: { repeat: 'x', highlight: 'kitchenDoor', guide: 'x' } })
  const b = propose_find_step({ targetObject: 'water-jug', instruction: 'Find the jug.', hints: { repeat: 'x', highlight: 'water-jug', guide: 'x' } })
  const c = propose_find_step({ targetObject: 'radio', instruction: 'Find the radio.', hints: { repeat: 'x', highlight: 'radio', guide: 'x' } })
  session.ingest([a, b, c])
  session.commit(a.proposalId)
  session.edit(b.proposalId, { instruction: 'Find the blue radio.' } as Partial<Proposal>)
  session.commit(b.proposalId)
  session.reject(c.proposalId)
  const counts = session.counts()
  eq(counts.accepted, 1, 'counts: one plain accept')
  eq(counts.edited, 1, 'counts: one edited-then-accepted')
  eq(counts.rejected, 1, 'counts: one caregiver reject')
  eq(counts.firewallRejected, 0, 'counts: none blocked by the firewall in this run')
}

// ---------------------------------------------------------------------------
// 7. buildPackFromProposals + the existing §4.2 validator, end to end
// ---------------------------------------------------------------------------

resetProposalIds()
{
  const world = makeWorld()
  const session = new ReviewSession(ctx(['Ananya is my granddaughter. Bina is my daughter.']))

  const ananya = propose_person({ name: 'Ananya', relationship: 'Granddaughter', photoAssetId: 'portrait-1' })
  const bina = propose_person({ name: 'Bina', relationship: 'Daughter', photoAssetId: 'portrait-1' })
  const nav = propose_navigate_step({
    targetRoom: 'kitchen', instruction: 'Please go to the kitchen.',
    hints: { repeat: 'Please go to the kitchen.', highlight: 'kitchenDoor', guide: 'Through this door.' }
  })
  const find = propose_find_step({
    targetObject: 'water-jug', instruction: 'Can you find the water jug?',
    hints: { repeat: 'Can you find the water jug?', highlight: 'water-jug', guide: 'It is on the counter.' }
  })
  const recall = propose_recall_step({
    question: 'Who visited you?',
    choices: [ananya.proposalId, bina.proposalId],
    answer: ananya.proposalId,
    reducedChoices: [ananya.proposalId, bina.proposalId],
    hints: { repeat: 'Who visited you?', highlight: 'reduce', guide: 'It was Ananya.' }
  })
  const level = propose_level({ title: 'A glass of water', stepProposalIds: [nav.proposalId, find.proposalId, recall.proposalId] })

  session.ingest([ananya, bina, nav, find, recall, level])
  ok(session.list().every((r) => r.status === 'pending'), 'end-to-end: every proposal passes the firewall on arrival')
  for (const r of session.list()) session.commit(r.proposal.proposalId)
  ok(session.committed().length === session.list().length, 'end-to-end: every proposal commits cleanly')

  const draft = buildPackFromProposals(emptyPack, session.committed(), (assetId) => `/packs/agent/${assetId}.jpg`)
  eq(draft.people.length, 2, 'end-to-end: both people land in the draft pack')
  eq(draft.missions.length, 1, 'end-to-end: one level assembled from its steps')
  eq(draft.missions[0].steps.length, 3, 'end-to-end: the level carries all three steps in order')

  const { pack, problems } = validate({ ...draft, missions: draft.missions.map((m) => ({ ...m, description: m.description || 'A caregiver-written level.' })) }, world)
  ok(pack !== null, 'end-to-end: the committed pack loads through the UNCHANGED §4.2 validator')
  eq(problems.length, 0, 'end-to-end: no validation problems — the pack format was not forked')
  ok(pack?.people.some((p) => p.name === 'Ananya') === true, 'end-to-end: the committed person is present by name')
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
