/**
 * §10.9 — configuration and degradation. `enabled: false` is the shipped default: with
 * it false the entire feature is inert and the app behaves exactly as at Checkpoint E.
 * Nothing in this file is imported from `main.ts`, so today that inertness is also
 * structural — the agent code is not even in the bundle's module graph yet.
 */

export type AgentProvider = 'none' | 'stub' | 'llama-cpp'

export interface AgentConfig {
  enabled: boolean
  provider: AgentProvider
  model: string
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
  promptVersion: 'f-1',
  consentGiven: false,
  maxProposalsPerRun: 12,
  redactBeforeSend: true
}

const STORAGE_KEY = 'smriti-agent-config-v1'

function isAgentProvider(v: unknown): v is AgentProvider {
  return v === 'none' || v === 'stub' || v === 'llama-cpp'
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

/**
 * Local inference changes what this dialog is *for*. There is no third party to name and
 * no upload to authorise, so this is a disclosure that a model reads the photographs at
 * all — not a data-transfer consent. The gate is kept because declining must still leave
 * the app at Checkpoint E behaviour, which is a property worth having either way.
 */
export const CONSENT_PROMPT: ConsentPrompt = {
  provider: 'a model running on this computer (llama.cpp)',
  sent: [
    'a downscaled, EXIF-stripped copy of each uploaded photo (the "probe" derivative), passed to a local llama-server over the loopback interface'
  ],
  notSent: [
    'anything to the internet — no photograph, note or telemetry leaves this machine',
    'original photo files',
    'audio/voice clips',
    'anything once you decline'
  ]
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
