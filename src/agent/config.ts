/**
 * §10.9 — configuration and degradation. `enabled: false` is the shipped default: with
 * it false the entire feature is inert and the app behaves exactly as at Checkpoint E.
 * Nothing in this file is imported from `main.ts`, so today that inertness is also
 * structural — the agent code is not even in the bundle's module graph yet.
 */

import { DEFAULT_LLAMACPP_ENDPOINT, isLoopbackEndpoint } from './llamaCpp'
import { AGENT_STORAGE_KEY } from './enabled'

export type AgentProvider = 'none' | 'stub' | 'anthropic' | 'llamacpp'

export interface AgentConfig {
  enabled: boolean
  provider: AgentProvider
  model: string
  /** Only meaningful for `llamacpp`: the base URL of a running `llama-server`. Empty
   *  means "use the adapter's loopback default". */
  endpoint: string
  promptVersion: string
  consentGiven: boolean
  maxProposalsPerRun: number
  redactBeforeSend: boolean
}

/** The stub model (§F1) is the default everywhere, including in tests — a real
 *  provider is opt-in, never accidental. */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  provider: 'stub',
  model: '',
  endpoint: '',
  promptVersion: 'f-1',
  consentGiven: false,
  maxProposalsPerRun: 12,
  redactBeforeSend: true
}

const STORAGE_KEY = AGENT_STORAGE_KEY

function isAgentProvider(v: unknown): v is AgentProvider {
  return v === 'none' || v === 'stub' || v === 'anthropic' || v === 'llamacpp'
}

/** Merges unknown persisted JSON onto the default, rejecting anything malformed rather
 *  than trusting it — a corrupted or hand-edited value must never silently enable the
 *  feature or point it at an unexpected provider. */
export function parseAgentConfig(raw: unknown): AgentConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_AGENT_CONFIG }
  const r = raw as Record<string, unknown>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_AGENT_CONFIG.enabled,
    provider: isAgentProvider(r.provider) ? r.provider : DEFAULT_AGENT_CONFIG.provider,
    model: typeof r.model === 'string' ? r.model : DEFAULT_AGENT_CONFIG.model,
    endpoint: typeof r.endpoint === 'string' ? r.endpoint : DEFAULT_AGENT_CONFIG.endpoint,
    promptVersion: typeof r.promptVersion === 'string' ? r.promptVersion : DEFAULT_AGENT_CONFIG.promptVersion,
    consentGiven: typeof r.consentGiven === 'boolean' ? r.consentGiven : DEFAULT_AGENT_CONFIG.consentGiven,
    maxProposalsPerRun:
      typeof r.maxProposalsPerRun === 'number' ? r.maxProposalsPerRun : DEFAULT_AGENT_CONFIG.maxProposalsPerRun,
    redactBeforeSend: typeof r.redactBeforeSend === 'boolean' ? r.redactBeforeSend : DEFAULT_AGENT_CONFIG.redactBeforeSend
  }
}

export const agentConfigStore = {
  load(): AgentConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? parseAgentConfig(JSON.parse(raw)) : { ...DEFAULT_AGENT_CONFIG }
    } catch {
      return { ...DEFAULT_AGENT_CONFIG }
    }
  },
  save(config: AgentConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      /* Local dev convenience only — a failed save just means consent is re-asked. */
    }
  }
}

// ---------------------------------------------------------------------------
// §10.6 — one-time consent, gating the first call
// ---------------------------------------------------------------------------

export interface ConsentPrompt {
  provider: string
  sent: string[]
  notSent: string[]
}

export const CONSENT_PROMPT: ConsentPrompt = {
  provider: 'Anthropic',
  sent: ['a downscaled, EXIF-stripped copy of each uploaded photo (the "probe" derivative)'],
  notSent: ['original photo files', 'audio/voice clips', 'telemetry', 'anything once you decline']
}

/**
 * The consent dialog has to describe what actually happens, and with a local runtime what
 * happens is different in kind, not degree: the probe goes to another process on the same
 * computer and no network is involved at all. Telling a caregiver "your photos will be
 * sent to a provider" in that case would be false, and saying nothing would be worse — so
 * this returns copy matched to the provider actually configured.
 *
 * The local wording is conditional on the endpoint really being loopback. A `llamacpp`
 * config pointed at another machine gets the off-machine wording, because that is the
 * truth of it.
 */
export function consentPromptFor(config: AgentConfig): ConsentPrompt {
  if (config.provider !== 'llamacpp') return CONSENT_PROMPT

  const endpoint = config.endpoint || DEFAULT_LLAMACPP_ENDPOINT
  if (isLoopbackEndpoint(endpoint)) {
    return {
      provider: `a model running on this computer (${endpoint})`,
      sent: [
        'a downscaled, EXIF-stripped copy of each uploaded photo, to another program on this same computer',
        'nothing over the internet — no account, no API key, no upload'
      ],
      notSent: [
        'original photo files',
        'audio/voice clips',
        'telemetry',
        'anything to Anthropic or any other company',
        'anything once you decline'
      ]
    }
  }

  return {
    provider: `a model server at ${endpoint}`,
    sent: [
      `a downscaled, EXIF-stripped copy of each uploaded photo, over the network to ${endpoint}`,
      'that address is not this computer, so the photo copies leave this machine'
    ],
    notSent: ['original photo files', 'audio/voice clips', 'telemetry', 'anything once you decline']
  }
}

/**
 * Gates the first provider call on consent (§10.6). If consent was already recorded,
 * resolves immediately. Otherwise calls `askUser` (the actual dialog — built in F3) and
 * records the answer. Declining leaves `config.enabled`/`provider` untouched, so the app
 * falls straight back to manual authoring — Checkpoint E behaviour exactly.
 */
export async function ensureConsent(
  config: AgentConfig,
  askUser: (prompt: ConsentPrompt) => Promise<boolean>
): Promise<{ allowed: boolean; config: AgentConfig }> {
  if (config.consentGiven) return { allowed: true, config }
  const granted = await askUser(CONSENT_PROMPT)
  return { allowed: granted, config: { ...config, consentGiven: granted } }
}
