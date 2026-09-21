/**
 * The caregiver setup screen: upload photographs, get proposals, review them, commit a
 * pack. This is the interface §10.1's trust boundary describes — caregiver uploads on one
 * side, a reviewed-and-confirmed pack on the other, and nothing crossing in between
 * without a human clicking Accept.
 *
 * Reachable only outside a patient session. `main.ts` hangs it off the level-select
 * screen, which is the same place the §9 profile editor lives and is by construction not
 * reachable while a level is being played (§10.1 rule F-1: no model call during a patient
 * session). This module never imports the mission runner, the player, or telemetry, so
 * there is no path from here into the play path at all.
 *
 * What "converted to a game environment" means concretely, and what it does not: the
 * model does not generate geometry. The house is procedural and already exists (§1). What
 * an uploaded photograph becomes is content placed into that house — a texture on a wall
 * or portrait anchor, a person in `people[]`, and recall/navigate/find steps that ask the
 * patient about it. That is `commitPack.ts`'s job, using the unmodified §4.1 pack schema,
 * so an agent-assisted pack loads through exactly the same path as a hand-authored one.
 *
 * Every failure here degrades to manual authoring rather than a blocked screen (§10.9):
 * no server, no model, a malformed answer and a declined consent dialog all leave the
 * caregiver on this screen with their uploads intact.
 */
import { receiveImage, ImagePipelineError, type ImageDerivatives } from './images'
import { buildAllowedTokens } from './tokens'
import { ReviewSession } from './review'
import { ProposalReviewList, renderConsentDialog } from './setupUI'
import { buildPackFromProposals } from './commitPack'
import { computeProvenance, type ProvenanceBlock } from './provenance'
import { consentPromptFor, type AgentConfig, type ConsentPrompt } from './config'
import { selectProvider } from './selectProvider'
import { AuditLog, consoleAuditSink } from './audit'
import * as THREE from 'three'
import {
  propose_find_step,
  propose_level,
  propose_navigate_step,
  propose_person,
  propose_photo_placement,
  propose_recall_step,
  request_caregiver_input,
  AGENT_TOOL_SCHEMA,
  type AnchorContentType,
  type AnchorSummary,
  type AssetSummary,
  type ToolResult
} from './tools'
import type { FirewallContext, WorldRegistry } from './firewall'
import type { ProbeImage, ProviderAdapter, ProviderToolCall } from './provider'
import type { MemoryPack } from '../Missions'
import type { WorldSource } from '../World'

/** Everything the screen needs to know about the world the pack will play in. Supplied
 *  by the caller, because only `main.ts` knows which house is loaded. */
export interface WorldFacts {
  rooms: string[]
  interactables: string[]
  hintTargets: string[]
  anchors: AnchorSummary[]
}

/**
 * §1's world contract stores anchors as bare `Object3D`s — it has never needed to say
 * what kind of content each one accepts, because a hand-authored pack simply names the
 * right anchor. The firewall's F-g rule does need it, so it is derived here from §1's
 * fixed anchor ids rather than by widening `WorldSource` for one caller's benefit.
 */
function contentTypeOf(anchorId: string): AnchorContentType {
  if (/audio|speaker|radio/i.test(anchorId)) return 'audio'
  if (/frame|portrait|bedside/i.test(anchorId)) return 'portrait'
  return 'wall'
}

/** Reads the live world into the facts the prompt and the firewall both need, so a
 *  caller does not have to assemble them (and cannot assemble them inconsistently). */
export function worldFactsFromSource(world: WorldSource): WorldFacts {
  const box = new THREE.Box3()
  const size = new THREE.Vector3()
  const anchors: AnchorSummary[] = Object.entries(world.anchors).map(([id, object]) => {
    box.setFromObject(object).getSize(size)
    // A frame hangs on a wall, so its meaningful aspect is the wider horizontal extent
    // over the vertical one. A degenerate or zero-sized box reads as square rather than
    // as Infinity, which would fail F-g for reasons that have nothing to do with the photo.
    const horizontal = Math.max(size.x, size.z)
    const aspect = size.y > 1e-6 && horizontal > 1e-6 ? horizontal / size.y : 1
    return { id, contentType: contentTypeOf(id), aspect }
  })
  return {
    rooms: [...new Set(world.triggers.map((t) => t.room))],
    interactables: Object.keys(world.interactables),
    hintTargets: Object.keys(world.hintTargets),
    anchors
  }
}

export interface UploadedAsset {
  id: string
  derivatives: ImageDerivatives
  /** Object URL of the 256px thumb — review UI only. */
  thumbUrl: string
  /** Object URL of the power-of-two texture — what actually goes into the world. */
  textureUrl: string
  aspect: number
}

export interface CaregiverSetupOptions {
  container: HTMLElement
  world: WorldFacts
  basePack: MemoryPack
  config: AgentConfig
  saveConfig(config: AgentConfig): void
  onCommit(pack: MemoryPack, provenance: ProvenanceBlock): void
  onClose(): void
  /** Injected in tests. Production passes nothing and gets the configured provider. */
  provider?: ProviderAdapter
  askConsent?(prompt: ConsentPrompt): Promise<boolean>
  audit?: AuditLog
}

/**
 * The instructions handed to the model. §10.7 is explicit that telling a model not to
 * invent facts is *not* the mitigation — the firewall is, and it runs on every proposal
 * regardless of what this text says. This exists because a clearer prompt produces fewer
 * proposals the caregiver has to reject, which is a quality argument, not a safety one.
 *
 * Read tools (§10.2) are resolved into this text rather than exposed as callable tools:
 * a multi-turn read/propose loop is exactly where a 3B model loses the thread, and every
 * read tool's answer is small enough to simply include.
 */
export function buildSystemPrompt(world: WorldFacts, assets: AssetSummary[], caregiverText: string): string {
  const anchorLines = world.anchors.map(
    (a) => `  - ${a.id} (holds a ${a.contentType}, aspect ratio ${a.aspect.toFixed(2)})`
  )
  const assetLines = assets.map(
    (a) => `  - ${a.id}${a.width && a.height ? ` (${a.width}x${a.height})` : ''}`
  )
  return [
    'You help a caregiver build a memory game for a person living with dementia.',
    'You propose content. You never apply it: a human reviews and confirms every proposal.',
    '',
    'The house already exists. Do not invent rooms, objects or anchors — use only these ids:',
    `Rooms:\n${world.rooms.map((r) => `  - ${r}`).join('\n') || '  (none)'}`,
    `Anchors:\n${anchorLines.join('\n') || '  (none)'}`,
    `Findable objects:\n${world.interactables.map((i) => `  - ${i}`).join('\n') || '  (none)'}`,
    `Hint highlight targets:\n${world.hintTargets.map((h) => `  - ${h}`).join('\n') || '  (none)'}`,
    `Uploaded photographs:\n${assetLines.join('\n') || '  (none)'}`,
    '',
    "The caregiver's own notes, verbatim — the only source of facts you have:",
    caregiverText || '  (nothing written yet)',
    '',
    'Rules:',
    '- You may describe what you can SEE in a photograph: how many people, indoors or out,',
    '  daylight or evening, roughly how old the photograph looks.',
    '- You may NOT state who someone is, when a photograph was taken, or where it was taken',
    '  unless the caregiver wrote it above. Never guess a name, a year or a place.',
    '- If you need a fact you have not been given, call request_caregiver_input instead of',
    '  guessing. Asking is correct behaviour, not a failure.',
    '- Write plainly and warmly, as one would speak to an elder. No clinical or diagnostic',
    '  words. No hedging ("perhaps", "it seems"). Keep each line short.',
    '- A recall question\'s answer must be one of its own choices.',
    '',
    'Reply with a JSON array of proposals and nothing else.'
  ].join('\n')
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Turns one provider tool call into a typed proposal. Anything unrecognised returns
 *  null and is dropped — the grammar makes that unreachable for a local model, but a
 *  hosted provider is not grammar-constrained and must not be trusted to stay in range. */
function toToolResult(call: ProviderToolCall): ToolResult | null {
  const a = call.args ?? {}
  switch (call.tool) {
    case 'propose_photo_placement':
      return propose_photo_placement(a)
    case 'propose_person':
      return propose_person(a)
    case 'propose_navigate_step':
      return propose_navigate_step(a)
    case 'propose_find_step':
      return propose_find_step(a)
    case 'propose_recall_step':
      return propose_recall_step(a)
    case 'propose_level':
      return propose_level(a)
    case 'request_caregiver_input':
      return request_caregiver_input(a)
    default:
      return null
  }
}

export class CaregiverSetupScreen {
  readonly root: HTMLElement
  private uploads: UploadedAsset[] = []
  private notes = ''
  private names: string[] = []
  private session: ReviewSession | null = null
  private reviewList: ProposalReviewList | null = null
  private status: HTMLParagraphElement
  private gallery: HTMLDivElement
  private reviewArea: HTMLDivElement
  private runButton: HTMLButtonElement
  private commitButton: HTMLButtonElement
  private audit: AuditLog
  private assetCounter = 0

  constructor(private readonly options: CaregiverSetupOptions) {
    this.audit = options.audit ?? new AuditLog(consoleAuditSink)
    this.root = document.createElement('div')
    this.root.className = 'agent-setup'
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')

    const title = document.createElement('h1')
    title.textContent = 'Build a memory pack from photographs'
    this.root.appendChild(title)

    const blurb = document.createElement('p')
    blurb.textContent =
      'Add photographs and write what you know about them. Suggestions are drafted for you ' +
      'to read, change and approve — nothing is added to the game until you accept it.'
    this.root.appendChild(blurb)

    this.root.appendChild(this.renderUploadControls())
    this.gallery = document.createElement('div')
    this.gallery.className = 'agent-setup__gallery'
    this.root.appendChild(this.gallery)

    this.root.appendChild(this.renderNotesControls())

    this.runButton = document.createElement('button')
    this.runButton.className = 'agent-setup__run'
    this.runButton.textContent = 'Draft suggestions'
    this.runButton.disabled = true
    this.runButton.addEventListener('click', () => void this.run())
    this.root.appendChild(this.runButton)

    this.status = document.createElement('p')
    this.status.className = 'agent-setup__status'
    this.status.setAttribute('role', 'status')
    this.root.appendChild(this.status)

    this.reviewArea = document.createElement('div')
    this.reviewArea.className = 'agent-setup__review'
    this.root.appendChild(this.reviewArea)

    this.commitButton = document.createElement('button')
    this.commitButton.className = 'agent-setup__commit'
    this.commitButton.textContent = 'Add approved items to the game'
    this.commitButton.disabled = true
    this.commitButton.addEventListener('click', () => this.commit())
    this.root.appendChild(this.commitButton)

    const close = document.createElement('button')
    close.className = 'agent-setup__close'
    close.textContent = 'Close'
    close.addEventListener('click', () => this.close())
    this.root.appendChild(close)

    options.container.appendChild(this.root)
  }

  private renderUploadControls(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'agent-setup__upload'

    const label = document.createElement('label')
    label.textContent = 'Photographs (JPEG, PNG or WebP)'
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.multiple = true
    input.addEventListener('change', () => {
      if (input.files) void this.addFiles([...input.files])
    })
    label.appendChild(input)
    wrap.appendChild(label)
    return wrap
  }

  private renderNotesControls(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'agent-setup__notes'

    const namesLabel = document.createElement('label')
    namesLabel.textContent = 'Who is in these photographs? (one name per line)'
    const namesInput = document.createElement('textarea')
    namesInput.rows = 3
    namesInput.addEventListener('input', () => {
      this.names = namesInput.value.split('\n').map((n) => n.trim()).filter(Boolean)
    })
    namesLabel.appendChild(namesInput)
    wrap.appendChild(namesLabel)

    const notesLabel = document.createElement('label')
    notesLabel.textContent = 'What would you like remembered about them?'
    const notesInput = document.createElement('textarea')
    notesInput.rows = 5
    notesInput.addEventListener('input', () => {
      this.notes = notesInput.value
    })
    notesLabel.appendChild(notesInput)
    wrap.appendChild(notesLabel)

    // §10.3's allow-list is built from exactly these two boxes plus the answers to any
    // request_caregiver_input. A photograph contributes no tokens, so nothing the model
    // claims to see can ever license a name, a year or a place.
    const note = document.createElement('p')
    note.className = 'agent-setup__hint'
    note.textContent =
      'Only what you type here can appear in the game. Anything a suggestion adds beyond ' +
      'your own words is blocked automatically.'
    wrap.appendChild(note)
    return wrap
  }

  /** Runs every upload through §10.5's pipeline. One bad file never fails the batch. */
  async addFiles(files: Blob[]): Promise<void> {
    for (const file of files) {
      try {
        const derivatives = await receiveImage(file)
        this.assetCounter += 1
        const asset: UploadedAsset = {
          id: `asset-${this.assetCounter}`,
          derivatives,
          thumbUrl: URL.createObjectURL(derivatives.thumb),
          textureUrl: URL.createObjectURL(derivatives.texture),
          aspect: derivatives.width / Math.max(1, derivatives.height)
        }
        this.uploads.push(asset)
        this.recordAudit('receive_image', 'ok', { assetId: asset.id, byteCount: derivatives.probe.size })
      } catch (error) {
        const message =
          error instanceof ImagePipelineError ? error.message : 'This file could not be read.'
        this.setStatus(message)
        this.recordAudit('receive_image', 'error', { byteCount: file.size })
      }
    }
    this.renderGallery()
    this.runButton.disabled = this.uploads.length === 0
  }

  private renderGallery(): void {
    this.gallery.replaceChildren()
    for (const asset of this.uploads) {
      const figure = document.createElement('figure')
      figure.className = 'agent-setup__thumb'
      figure.dataset.assetId = asset.id
      const img = document.createElement('img')
      img.src = asset.thumbUrl
      img.alt = `Uploaded photograph ${asset.id}`
      const caption = document.createElement('figcaption')
      caption.textContent = `${asset.derivatives.width}×${asset.derivatives.height}`
      figure.appendChild(img)
      figure.appendChild(caption)
      this.gallery.appendChild(figure)
    }
  }

  private setStatus(message: string): void {
    this.status.textContent = message
  }

  /** §10.6: records that a call happened — tool, asset id, byte count, model, outcome.
   *  Never the image, never the caregiver's words; `AuditEntry` has no field for them. */
  private recordAudit(
    tool: string,
    outcome: 'ok' | 'error',
    extra: { assetId?: string; byteCount?: number; modelId?: string } = {}
  ): void {
    this.audit.record({
      timestamp: new Date().toISOString(),
      tool,
      assetId: extra.assetId,
      byteCount: extra.byteCount,
      modelId: extra.modelId ?? this.options.config.model,
      promptVersion: this.options.config.promptVersion,
      outcome
    })
  }

  private firewallContext(): FirewallContext {
    const world: WorldRegistry = {
      rooms: new Set(this.options.world.rooms),
      interactables: new Set(this.options.world.interactables),
      hintTargets: new Set(this.options.world.hintTargets),
      anchors: new Map(
        this.options.world.anchors.map((a) => [a.id, { contentType: a.contentType, aspect: a.aspect }])
      )
    }
    return {
      allowedTokens: buildAllowedTokens({ texts: [this.notes], fields: this.names }),
      world,
      assets: new Map(this.uploads.map((u) => [u.id, { id: u.id, kind: 'image' as const, aspect: u.aspect }])),
      people: new Set(this.options.basePack.people.map((p) => p.id))
    }
  }

  private assetSummaries(): AssetSummary[] {
    return this.uploads.map((u) => ({
      id: u.id,
      kind: 'image' as const,
      width: u.derivatives.width,
      height: u.derivatives.height
    }))
  }

  /** The one place a model is actually called. Gated on consent, and every exit that
   *  isn't a successful run leaves the caregiver exactly where they were. */
  async run(): Promise<void> {
    this.runButton.disabled = true
    this.setStatus('Preparing photographs…')

    const consentPrompt = consentPromptFor(this.options.config)
    const ask =
      this.options.askConsent ?? ((prompt: ConsentPrompt) => renderConsentDialog(this.root, prompt))

    let config = this.options.config
    if (!config.consentGiven) {
      const granted = await ask(consentPrompt)
      config = { ...config, consentGiven: granted }
      this.options.saveConfig(config)
      if (!granted) {
        this.setStatus('No suggestions were drafted. You can write this pack by hand.')
        this.runButton.disabled = false
        return
      }
    }

    const probeImages: ProbeImage[] = []
    for (const upload of this.uploads) {
      probeImages.push({
        assetId: upload.id,
        // The pipeline re-encodes every derivative as JPEG (§10.5), so this is accurate
        // regardless of what the caregiver originally uploaded.
        mimeType: 'image/jpeg',
        base64: await blobToBase64(upload.derivatives.probe)
      })
    }

    const provider = this.options.provider ?? selectProvider(config)
    this.setStatus('Drafting suggestions… this can take a minute on a local model.')

    const totalBytes = this.uploads.reduce((sum, u) => sum + u.derivatives.probe.size, 0)
    const result = await provider.run({
      systemPrompt: buildSystemPrompt(this.options.world, this.assetSummaries(), this.notes),
      tools: AGENT_TOOL_SCHEMA,
      caregiverText: this.notes,
      probeImages
    })

    if (!result.ok) {
      this.recordAudit('provider_run', 'error', { byteCount: totalBytes })
      this.setStatus(result.message)
      this.runButton.disabled = false
      return
    }

    this.recordAudit('provider_run', 'ok', { byteCount: totalBytes, modelId: result.model })

    const capped = result.toolCalls.slice(0, config.maxProposalsPerRun)
    const results = capped.map(toToolResult).filter((r): r is ToolResult => r !== null)

    const session = new ReviewSession(this.firewallContext())
    session.ingest(results)
    this.session = session
    this.renderReview(result.model)
    this.runButton.disabled = false
  }

  private renderReview(model: string): void {
    if (!this.session) return
    const session = this.session
    this.reviewArea.replaceChildren()
    this.reviewList = new ProposalReviewList(session, () => {
      this.commitButton.disabled = session.committed().length === 0
    })
    this.reviewArea.appendChild(this.reviewList.root)
    this.commitButton.disabled = session.committed().length === 0

    const counts = session.counts()
    this.setStatus(
      counts.firewallRejected > 0
        ? `${counts.firewallRejected} suggestion(s) were blocked automatically — the reason is shown on each. Model: ${model}.`
        : `Review the suggestions below. Model: ${model}.`
    )
  }

  /**
   * Commit is the only path from a proposal into a pack, and `buildPackFromProposals`
   * only ever sees what `session.committed()` returns — proposals a caregiver clicked
   * Accept on, each of which re-ran the firewall at that click (§10.3's second pass).
   */
  private commit(): void {
    if (!this.session) return
    const committed = this.session.committed()
    if (committed.length === 0) return

    const byId = new Map(this.uploads.map((u) => [u.id, u]))
    const pack = buildPackFromProposals(this.options.basePack, committed, (assetId) => {
      // The texture derivative, never the probe and never the original: what goes into
      // the world is the power-of-two copy made for exactly that purpose (§10.5).
      return byId.get(assetId)?.textureUrl ?? ''
    })

    const provenance = computeProvenance(
      this.session.counts(),
      this.options.config.model || this.options.config.provider,
      this.options.config.promptVersion
    )
    this.options.onCommit({ ...pack, provenance }, provenance)
    this.setStatus(`Added ${committed.length} item(s) to the game.`)
  }

  /** Releases every object URL this screen created. Uploads are deliberately not
   *  persisted anywhere — closing the screen is the end of them. */
  close(): void {
    for (const upload of this.uploads) {
      URL.revokeObjectURL(upload.thumbUrl)
      URL.revokeObjectURL(upload.textureUrl)
    }
    this.uploads = []
    this.root.remove()
    this.options.onClose()
  }
}

/** Convenience entry point for `main.ts`, which should not need to know the class. */
export function openCaregiverSetup(options: CaregiverSetupOptions): CaregiverSetupScreen {
  return new CaregiverSetupScreen(options)
}
