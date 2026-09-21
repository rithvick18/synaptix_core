/**
 * §10 F3 — the caregiver setup screen and proposal review list. Plain DOM, no
 * framework, matching `src/ui.ts`'s style. This file is never imported by `main.ts`
 * (agent.enabled stays false throughout Checkpoint F — §10.9), so it has zero effect on
 * the shipped build or the patient play path; a future checkpoint wires an entry point
 * to it from the level-selection screen, gated on `agent.enabled`.
 *
 * All state lives in `ReviewSession` (`review.ts`) — this file only renders it and
 * forwards DOM events to session methods. `commitProposal` / `rejectProposal` are
 * reachable only from the click handlers below: there is no code path from a
 * `ProviderToolCall` to either.
 */
import type { Violation } from './firewall'
import { ReviewSession, type ProposalStatus, type ReviewCounts, type ReviewedProposal } from './review'
import type { CaregiverInputRequest, NormalisedRect, Proposal } from './tools'
import type { ConsentPrompt } from './config'

export interface CropHandles {
  onChange(crop: NormalisedRect): void
}

/** Wires drag handles on a crop preview element to a normalised rect callback. Pointer
 *  math only — the caller owns rendering the frame. The *committed* crop is whatever
 *  is in `NormalisedRect` when Accept/Commit is clicked: this module never substitutes
 *  the model's proposed crop for what the caregiver actually left in the box. */
export function wireCropDrag(handle: HTMLElement, frame: HTMLElement, initial: NormalisedRect, handles: CropHandles): NormalisedRect {
  let crop = { ...initial }
  let dragging = false
  let startX = 0
  let startY = 0
  let startCrop = crop

  handle.addEventListener('pointerdown', (e) => {
    dragging = true
    startX = e.clientX
    startY = e.clientY
    startCrop = crop
    handle.setPointerCapture(e.pointerId)
  })
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const rect = frame.getBoundingClientRect()
    const dx = (e.clientX - startX) / Math.max(1, rect.width)
    const dy = (e.clientY - startY) / Math.max(1, rect.height)
    crop = {
      x: Math.min(1 - startCrop.width, Math.max(0, startCrop.x + dx)),
      y: Math.min(1 - startCrop.height, Math.max(0, startCrop.y + dy)),
      width: startCrop.width,
      height: startCrop.height
    }
    handles.onChange(crop)
  })
  handle.addEventListener('pointerup', () => { dragging = false })
  return crop
}

function statusLabel(status: ProposalStatus): string {
  switch (status) {
    case 'pending': return 'Awaiting review'
    case 'accepted': return 'Accepted'
    case 'edited': return 'Accepted (edited)'
    case 'rejected': return 'Rejected'
    case 'firewallRejected': return 'Blocked by the content firewall'
  }
}

function summarise(p: Proposal): string {
  switch (p.kind) {
    case 'photo_placement': return `Place a photo on "${p.anchorId}"`
    case 'person': return `Add ${p.name} (${p.relationship})`
    case 'navigate_step': return `Navigate: ${p.instruction}`
    case 'find_step': return `Find: ${p.instruction}`
    case 'recall_step': return `Ask: ${p.question}`
    case 'level': return `Level: ${p.title}`
  }
}

function violationLine(v: Violation): string {
  // §10.3: "shown to the caregiver with the rule id and the offending token, never
  // silently dropped." This is the one line that promise has to keep.
  return `${v.rule}: "${v.token}" — ${v.message}`
}

/**
 * §10.8: "Surface all four numbers in the review UI; they are the honest measure of how
 * much the agent actually contributed." `edited` outnumbering `accepted` is called out
 * as a good sign, not a bad one, so it is never buried under a single rolled-up count.
 */
export function renderProvenanceSummary(counts: ReviewCounts): HTMLElement {
  const el = document.createElement('dl')
  el.className = 'agent-provenance-summary'
  const rows: [string, number][] = [
    ['Accepted', counts.accepted],
    ['Edited', counts.edited],
    ['Rejected', counts.rejected],
    ['Blocked by firewall', counts.firewallRejected],
    ['Caregiver questions', counts.caregiverInputRequests]
  ]
  for (const [label, value] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = String(value)
    el.appendChild(dt)
    el.appendChild(dd)
  }
  return el
}

export class ProposalReviewList {
  readonly root: HTMLElement
  private summary: HTMLElement

  constructor(
    private session: ReviewSession,
    private onChange: () => void
  ) {
    this.root = document.createElement('div')
    this.root.className = 'agent-review-list'
    this.summary = renderProvenanceSummary(this.session.counts())
    this.root.appendChild(this.summary)
    this.render()
  }

  render(): void {
    const newSummary = renderProvenanceSummary(this.session.counts())
    this.summary.replaceWith(newSummary)
    this.summary = newSummary
    for (const el of [...this.root.children]) {
      if (el !== this.summary) el.remove()
    }
    for (const reviewed of this.session.list()) {
      this.root.appendChild(this.renderRow(reviewed))
    }
    for (const request of this.session.pendingInputRequests()) {
      this.root.appendChild(this.renderInputRequest(request))
    }
  }

  private renderRow(reviewed: ReviewedProposal): HTMLElement {
    const row = document.createElement('div')
    row.className = `agent-proposal agent-proposal--${reviewed.status}`
    row.dataset.proposalId = reviewed.proposal.proposalId

    const summary = document.createElement('p')
    summary.textContent = summarise(reviewed.proposal)
    row.appendChild(summary)

    const status = document.createElement('p')
    status.className = 'agent-proposal__status'
    status.textContent = statusLabel(reviewed.status)
    row.appendChild(status)

    if (reviewed.violations.length > 0) {
      const list = document.createElement('ul')
      list.className = 'agent-proposal__violations'
      for (const v of reviewed.violations) {
        const li = document.createElement('li')
        li.textContent = violationLine(v)
        list.appendChild(li)
      }
      row.appendChild(list)
    }

    if (reviewed.status !== 'rejected' && reviewed.status !== 'accepted') {
      const accept = document.createElement('button')
      accept.textContent = 'Accept'
      accept.addEventListener('click', () => {
        this.session.commit(reviewed.proposal.proposalId)
        this.render()
        this.onChange()
      })
      row.appendChild(accept)

      const reject = document.createElement('button')
      reject.textContent = 'Reject'
      reject.addEventListener('click', () => {
        this.session.reject(reviewed.proposal.proposalId)
        this.render()
        this.onChange()
      })
      row.appendChild(reject)
    }

    return row
  }

  private renderInputRequest(request: CaregiverInputRequest): HTMLElement {
    const row = document.createElement('div')
    row.className = 'agent-input-request'
    const label = document.createElement('label')
    label.textContent = `${request.why} (${request.field})`
    const input = document.createElement('input')
    input.type = 'text'
    const submit = document.createElement('button')
    submit.textContent = 'Answer'
    submit.addEventListener('click', () => {
      if (!input.value.trim()) return
      this.session.answerCaregiverInput(request.proposalId, input.value.trim())
      this.render()
      this.onChange()
    })
    row.appendChild(label)
    row.appendChild(input)
    row.appendChild(submit)
    return row
  }
}

/** §10.6's one-time consent dialog. Returns a promise that resolves once the caregiver
 *  answers; declining resolves `false` and nothing else in the app changes. */
export function renderConsentDialog(container: HTMLElement, prompt: ConsentPrompt): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('div')
    dialog.className = 'agent-consent-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')

    const title = document.createElement('h2')
    title.textContent = `Send photos to ${prompt.provider}?`
    dialog.appendChild(title)

    const sent = document.createElement('p')
    sent.textContent = `Sent: ${prompt.sent.join('; ')}.`
    dialog.appendChild(sent)

    const notSent = document.createElement('p')
    notSent.textContent = `Never sent: ${prompt.notSent.join('; ')}.`
    dialog.appendChild(notSent)

    const accept = document.createElement('button')
    accept.textContent = 'Allow'
    accept.addEventListener('click', () => { dialog.remove(); resolve(true) })

    const decline = document.createElement('button')
    decline.textContent = 'Decline — continue writing this pack by hand'
    decline.addEventListener('click', () => { dialog.remove(); resolve(false) })

    dialog.appendChild(accept)
    dialog.appendChild(decline)
    container.appendChild(dialog)
  })
}
