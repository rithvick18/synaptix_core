/**
 * The one piece of the agent layer `main.ts` is allowed to import statically.
 *
 * It imports nothing itself, on purpose. §10.9 says that with `agent.enabled: false` the
 * entire feature is inert, and the strongest version of that claim is structural: the
 * boot path can ask whether the feature is on without dragging the firewall, the tool
 * schema, the grammar or a provider adapter into the bundle. Everything else under
 * `src/agent/` reaches the browser only behind a dynamic `import()` that runs after this
 * returns true — so a default build downloads none of it.
 *
 * `config.ts` imports the storage key from here rather than redeclaring it, so the flag
 * this file reads and the config that writes it cannot drift apart.
 */

export const AGENT_STORAGE_KEY = 'smriti-agent-config-v1'

/**
 * True only when a caregiver has explicitly turned the feature on for this browser.
 * Every failure mode — no storage, malformed JSON, a hand-edited value of the wrong
 * type — answers false, because the safe answer and the default answer are the same one.
 */
export function isAgentEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AGENT_STORAGE_KEY)
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && (parsed as { enabled?: unknown }).enabled === true
  } catch {
    return false
  }
}
