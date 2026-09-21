/**
 * §10.9 — configuration and degradation. `enabled: false` is the shipped default: with
 * it false the entire feature is inert and the app behaves exactly as at Checkpoint E.
 *
 * Checkpoint F4 adds the **setup mode**: the first thing the app asks is where the
 * model that reads room photographs should run. `offline` keeps §10.6's original
 * promise — a llama.cpp server on this machine, nothing on the wire. `online` trades
 * that promise for not having to install anything, by sending the probe derivatives to
 * Google's Gemini API. The two are genuinely different privacy positions, so they carry
 * genuinely different disclosure copy (`consentPromptFor`) and consent never carries
 * from one to the other (`applySetupMode`).
 *
 * `setupMode: null` means "not asked yet", which is what puts the setup screen on
 * screen at start. It is not a third mode: nothing runs until one of the two is chosen.
 */

export type AgentProvider = 'none' | 'stub' | 'llama-cpp' | 'gemini'

/** Where inference happens. One is chosen at start and can be changed afterwards. */
export type SetupMode = 'offline' | 'online'

export const SETUP_MODES: readonly SetupMode[] = ['offline', 'online']

/** Informational for llama.cpp (the server serves whichever `.gguf` it was started
 *  with) and load-bearing for Gemini (it is the model id in the request path). */
export const OFFLINE_MODEL = 'gemma-3-4b-it-Q4_K_M'
export const ONLINE_MODEL = 'gemini-3.5-flash-lite'

export interface AgentConfig {
  enabled: boolean
  /** `null` until the caregiver answers the setup screen — see `needsSetup`. */
  setupMode: SetupMode | null
  provider: AgentProvider
  model: string
  /**
   * Online mode only. Held in this browser's storage and sent as the `x-goog-api-key`
   * header to `generativelanguage.googleapis.com` and nowhere else — `gemini.ts`
   * refuses any other host before it opens a socket. Offline mode clears it.
   */
  apiKey: string
  promptVersion: string
  consentGiven: boolean
  maxProposalsPerRun: number
  redactBeforeSend: boolean
}

/** The stub model (§F1) is the default everywhere, including in tests — a real
 *  provider is opt-in, never accidental. */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  setupMode: null,
  provider: 'stub',
  model: '',
  apiKey: '',
  promptVersion: 'f-1',
  consentGiven: false,
  maxProposalsPerRun: 12,
  redactBeforeSend: true
}

const STORAGE_KEY = 'smriti-agent-config-v1'

function isAgentProvider(v: unknown): v is AgentProvider {
  return v === 'none' || v === 'stub' || v === 'llama-cpp' || v === 'gemini'
}

function isSetupMode(v: unknown): v is SetupMode {
  return v === 'offline' || v === 'online'
}

/** Merges unknown persisted JSON onto the default, rejecting anything malformed rather
 *  than trusting it — a corrupted or hand-edited value must never silently enable the
 *  feature or point it at an unexpected provider. */
export function parseAgentConfig(raw: unknown): AgentConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_AGENT_CONFIG }
  const r = raw as Record<string, unknown>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_AGENT_CONFIG.enabled,
    setupMode: isSetupMode(r.setupMode) ? r.setupMode : DEFAULT_AGENT_CONFIG.setupMode,
    provider: isAgentProvider(r.provider) ? r.provider : DEFAULT_AGENT_CONFIG.provider,
    model: typeof r.model === 'string' ? r.model : DEFAULT_AGENT_CONFIG.model,
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : DEFAULT_AGENT_CONFIG.apiKey,
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
// §10.9 F4 — the setup mode
// ---------------------------------------------------------------------------

/** True until the caregiver has answered the setup screen. The screen is shown at
 *  start on exactly this condition, so answering it once is enough. */
export function needsSetup(config: AgentConfig): boolean {
  return config.setupMode === null
}

export function providerForMode(mode: SetupMode): AgentProvider {
  return mode === 'online' ? 'gemini' : 'llama-cpp'
}

export function defaultModelForMode(mode: SetupMode): string {
  return mode === 'online' ? ONLINE_MODEL : OFFLINE_MODEL
}

export interface SetupModeOptions {
  /** Online mode only; ignored offline, where the stored key is cleared instead. */
  apiKey?: string
  model?: string
}

/**
 * Records a setup choice. Two properties are deliberate and are what the checks pin:
 *
 * 1. **Consent never crosses modes.** Agreeing that a model on your own machine may
 *    look at the photographs is not agreement that Google may. So a *change* of mode
 *    resets `consentGiven`; the surface that offers the change is the one that shows
 *    `consentPromptFor(mode)` and re-records the answer.
 * 2. **Offline holds no key.** Choosing offline clears `apiKey`, so a machine that has
 *    been switched back to local inference is not still carrying a credential.
 */
export function applySetupMode(config: AgentConfig, mode: SetupMode, options: SetupModeOptions = {}): AgentConfig {
  const changed = config.setupMode !== mode
  return {
    ...config,
    enabled: true,
    setupMode: mode,
    provider: providerForMode(mode),
    model: options.model ?? defaultModelForMode(mode),
    apiKey: mode === 'online' ? (options.apiKey ?? config.apiKey).trim() : '',
    consentGiven: changed ? false : config.consentGiven
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
 * Offline mode. Local inference changes what this dialog is *for*. There is no third
 * party to name and no upload to authorise, so this is a disclosure that a model reads
 * the photographs at all — not a data-transfer consent. The gate is kept because
 * declining must still leave the app at Checkpoint E behaviour, which is a property
 * worth having either way.
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
 * Online mode. This one *is* a data-transfer consent, and it says so without softening
 * it: the probe derivatives and the typed notes cross the internet to Google. The list
 * below is the honest difference from offline, not a reassurance — the only line the
 * two share is that the originals stay here.
 */
export const ONLINE_CONSENT_PROMPT: ConsentPrompt = {
  provider: `Google's Gemini API (${ONLINE_MODEL}), over the internet`,
  sent: [
    'a downscaled, EXIF-stripped copy of each room photograph you choose (the "probe" derivative)',
    'the notes you type on the setup form',
    'your Gemini API key, as the request header that authenticates it'
  ],
  notSent: [
    'original photo files — they never leave this browser',
    'audio/voice clips',
    "the patient's name, the memory pack, or any telemetry",
    'anything at all while you are playing a level — the game itself never contacts the internet',
    'anything once you decline'
  ]
}

export function consentPromptFor(mode: SetupMode | null): ConsentPrompt {
  return mode === 'online' ? ONLINE_CONSENT_PROMPT : CONSENT_PROMPT
}

/**
 * Gates the first provider call on consent (§10.6). If consent was already recorded,
 * resolves immediately. Otherwise calls `askUser` with the prompt for the *configured
 * mode* and records the answer. Declining leaves `config.enabled`/`provider` untouched,
 * so the app falls straight back to manual authoring — Checkpoint E behaviour exactly.
 */
export async function ensureConsent(
  config: AgentConfig,
  askUser: (prompt: ConsentPrompt) => Promise<boolean>
): Promise<{ allowed: boolean; config: AgentConfig }> {
  if (config.consentGiven) return { allowed: true, config }
  const granted = await askUser(consentPromptFor(config.setupMode))
  return { allowed: granted, config: { ...config, consentGiven: granted } }
}
