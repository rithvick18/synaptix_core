/**
 * §10 F3 — the caregiver review state machine. UI-agnostic: this file has no DOM in it,
 * so it is fully testable headlessly, and a real screen (`setupUI.ts`) is a thin
 * renderer over it. `commitProposal` / `rejectProposal` live here, exactly as §10.2
 * describes them — UI-only actions, unreachable from a model, since nothing exports a
 * way to call them from `ProviderToolCall` data.
 */
import { validateProposal, type FirewallContext, type FirewallResult, type Violation } from './firewall'
import { buildAllowedTokens } from './tokens'
import type { CaregiverInputRequest, Proposal, ToolResult } from './tools'

export type ProposalStatus = 'pending' | 'accepted' | 'edited' | 'rejected' | 'firewallRejected'

export interface ReviewedProposal {
  proposal: Proposal
  status: ProposalStatus
  violations: Violation[]
  /** True once a caregiver has changed anything on this proposal — §10.8's `edited`
   *  counter, and the guarantee that a commit after an edit carries the caregiver's own
   *  text, never the model's original wording. */
  edited: boolean
}

export interface ReviewCounts {
  accepted: number
  edited: number
  rejected: number
  firewallRejected: number
  caregiverInputRequests: number
}

/**
 * One agent run's worth of proposals, under caregiver review. Owns the firewall context
 * so that answering a `request_caregiver_input` question can grow `allowedTokens` and
 * re-validate every open proposal against the wider allow-list (§10.2's escape hatch,
 * made to actually unblock something).
 */
export class ReviewSession {
  private proposals = new Map<string, ReviewedProposal>()
  private inputRequests: CaregiverInputRequest[] = []
  private answeredInputRequests = new Set<string>()

  constructor(private ctx: FirewallContext) {}

  /** Feeds in everything a provider run produced — proposals get firewall-checked on
   *  arrival (§10.3: "runs when a proposal is created"); input requests are queued for
   *  the caregiver. */
  ingest(results: ToolResult[]): void {
    // A `person` proposal registers its id as a known person immediately, so a
    // `recall_step` proposed in the same batch can reference it right away (§10.2's
    // tools are typically called together within one agent run) — without this, F-d
    // would reject every recall step that names a person the same run just proposed.
    for (const r of results) {
      if (r.kind === 'person') {
        this.ctx = { ...this.ctx, people: new Set([...this.ctx.people, r.proposalId]) }
      }
    }
    for (const r of results) {
      if (r.kind === 'caregiver_input_request') {
        this.inputRequests.push(r)
        continue
      }
      this.record(r)
    }
  }

  private record(proposal: Proposal, edited = false): void {
    const result = validateProposal(proposal, this.ctx)
    this.proposals.set(proposal.proposalId, {
      proposal,
      status: result.ok ? (edited ? 'edited' : 'pending') : 'firewallRejected',
      violations: result.violations,
      edited
    })
  }

  /**
   * The caregiver answers a `request_caregiver_input` question (§10.2's escape hatch).
   * The answer becomes an allowed token — caregiver-supplied, exactly like any other
   * typed field (§10.3) — and every open proposal is re-validated against the widened
   * allow-list, so a proposal that was only blocked by a missing fact can now pass.
   */
  answerCaregiverInput(requestId: string, answer: string): void {
    const request = this.inputRequests.find((r) => r.proposalId === requestId)
    if (!request) return
    this.answeredInputRequests.add(requestId)
    const added = buildAllowedTokens({ texts: [answer], fields: [answer] })
    const allowedTokens = new Set(this.ctx.allowedTokens)
    for (const t of added) allowedTokens.add(t)
    this.ctx = { ...this.ctx, allowedTokens }

    for (const [id, rp] of this.proposals) {
      if (rp.status === 'rejected' || rp.status === 'accepted') continue // caregiver decisions are not silently reopened
      const result = validateProposal(rp.proposal, this.ctx)
      this.proposals.set(id, {
        ...rp,
        status: result.ok ? (rp.edited ? 'edited' : 'pending') : 'firewallRejected',
        violations: result.violations
      })
    }
  }

  /** The caregiver edits a proposal's fields directly. Re-validates immediately — an
   *  edit can introduce a new violation as easily as it can fix one. */
  edit(id: string, patch: Partial<Proposal>): void {
    const rp = this.proposals.get(id)
    if (!rp) return
    const updated = { ...rp.proposal, ...patch } as Proposal
    this.record(updated, true)
  }

  reject(id: string): void {
    const rp = this.proposals.get(id)
    if (!rp) return
    this.proposals.set(id, { ...rp, status: 'rejected' })
  }

  /**
   * §10.2 / §10.3: commit re-runs the firewall — the *second* pass, independent of the
   * one at proposal-creation time. Only marks the proposal accepted/edited when it still
   * passes; a proposal that somehow regressed (e.g. the caregiver's edit itself violates
   * a rule) is refused here even if `edit()` didn't catch it, so there is exactly one
   * path by which a proposal's content reaches a pack, and it always re-checks.
   */
  commit(id: string): FirewallResult {
    const rp = this.proposals.get(id)
    if (!rp) {
      return { ok: false, violations: [{ rule: 'F-f', token: id, message: 'no such proposal' }] }
    }
    const result = validateProposal(rp.proposal, this.ctx)
    this.proposals.set(id, {
      ...rp,
      status: result.ok ? (rp.edited ? 'edited' : 'accepted') : 'firewallRejected',
      violations: result.violations
    })
    return result
  }

  get(id: string): ReviewedProposal | undefined {
    return this.proposals.get(id)
  }

  list(): ReviewedProposal[] {
    return [...this.proposals.values()]
  }

  committed(): ReviewedProposal[] {
    return this.list().filter((r) => r.status === 'accepted' || r.status === 'edited')
  }

  pendingInputRequests(): CaregiverInputRequest[] {
    return this.inputRequests.filter((r) => !this.answeredInputRequests.has(r.proposalId))
  }

  /** §10.8's provenance counters, read straight off session state rather than tracked
   *  separately — there is exactly one place these numbers can disagree with reality,
   *  and it is here. */
  counts(): ReviewCounts {
    const list = this.list()
    return {
      accepted: list.filter((r) => r.status === 'accepted').length,
      edited: list.filter((r) => r.status === 'edited').length,
      rejected: list.filter((r) => r.status === 'rejected').length,
      firewallRejected: list.filter((r) => r.status === 'firewallRejected').length,
      caregiverInputRequests: this.inputRequests.length
    }
  }
}
