/**
 * §10 F3 — folds committed proposals into a draft pack using the existing §4.1 schema.
 * Deliberately thin: this module only assembles a `MemoryPack` object. It never
 * validates one — `MemoryPack.ts`'s existing `validate()` does that, unchanged, exactly
 * as it does for a hand-authored or caregiver-editor pack. The pack format is not
 * forked for agent-authored content.
 *
 * Convention: a committed `person` proposal's `proposalId` becomes that person's `id`
 * in the pack, so a `recall_step` proposal's `choices` can reference it directly, the
 * same way a hand-authored pack's `choices` reference `people[].id`.
 */
import type { MemoryPack, Mission, Person, Step } from '../Missions'
import type { Proposal } from './tools'
import type { ReviewedProposal } from './review'

export type AssetUrlResolver = (assetId: string) => string

export function buildPackFromProposals(
  base: MemoryPack,
  committed: ReviewedProposal[],
  assetUrl: AssetUrlResolver
): MemoryPack {
  const people: Person[] = [...base.people]
  const anchors: Record<string, string> = { ...base.anchors }
  const missions: Mission[] = [...base.missions]
  const stepsById = new Map<string, Step>()

  const proposals = committed.map((r) => r.proposal)

  for (const proposal of proposals) {
    applyNonLevelProposal(proposal, people, anchors, stepsById, assetUrl)
  }
  for (const proposal of proposals) {
    if (proposal.kind !== 'level') continue
    const steps = proposal.stepProposalIds
      .map((id) => stepsById.get(id))
      .filter((s): s is Step => s !== undefined)
    missions.push({ id: proposal.proposalId, title: proposal.title, description: '', steps })
  }

  return { ...base, people, anchors, missions }
}

function applyNonLevelProposal(
  proposal: Proposal,
  people: Person[],
  anchors: Record<string, string>,
  stepsById: Map<string, Step>,
  assetUrl: AssetUrlResolver
): void {
  switch (proposal.kind) {
    case 'person':
      people.push({
        id: proposal.proposalId,
        name: proposal.name,
        relationship: proposal.relationship,
        photo: assetUrl(proposal.photoAssetId),
        voice: proposal.voiceAssetId ? assetUrl(proposal.voiceAssetId) : undefined
      })
      break
    case 'photo_placement':
      anchors[proposal.anchorId] = assetUrl(proposal.assetId)
      break
    case 'navigate_step':
      stepsById.set(proposal.proposalId, {
        type: 'navigate',
        targetRoom: proposal.targetRoom,
        instruction: proposal.instruction,
        hints: proposal.hints
      })
      break
    case 'find_step':
      stepsById.set(proposal.proposalId, {
        type: 'find',
        targetObject: proposal.targetObject,
        instruction: proposal.instruction,
        hints: proposal.hints
      })
      break
    case 'recall_step':
      stepsById.set(proposal.proposalId, {
        type: 'recall',
        question: proposal.question,
        choiceType: proposal.choiceType ?? 'person',
        choices: proposal.choices,
        answer: proposal.answer,
        reducedChoices: proposal.reducedChoices,
        hints: proposal.hints
      })
      break
    case 'level':
      break // handled by the caller once every step proposal has been indexed
  }
}
