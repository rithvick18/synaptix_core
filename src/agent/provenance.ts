/**
 * §10.8 — provenance and telemetry. Patient session telemetry (§4.4) is unchanged;
 * this module only computes the extra block a caregiver-confirmed, agent-assisted pack
 * carries, and it reads that straight off `ReviewSession` state (`review.ts`) — there is
 * exactly one place these numbers are tracked, so the provenance block cannot disagree
 * with what the review screen showed the caregiver.
 */
import type { ReviewCounts } from './review'

export interface ProvenanceBlock {
  agentAssisted: true
  model: string
  promptVersion: string
  proposals: {
    accepted: number
    edited: number
    rejected: number
    firewallRejected: number
  }
  caregiverInputRequests: number
  confirmedBy: string
  confirmedAt: string
}

export function computeProvenance(
  counts: ReviewCounts,
  model: string,
  promptVersion: string,
  confirmedBy = 'caregiver',
  confirmedAt: string = new Date().toISOString()
): ProvenanceBlock {
  return {
    agentAssisted: true,
    model,
    promptVersion,
    proposals: {
      accepted: counts.accepted,
      edited: counts.edited,
      rejected: counts.rejected,
      firewallRejected: counts.firewallRejected
    },
    caregiverInputRequests: counts.caregiverInputRequests,
    confirmedBy,
    confirmedAt
  }
}
