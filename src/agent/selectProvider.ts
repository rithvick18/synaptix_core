/**
 * §10.9 — the stub model (§F1) stays selectable by config and remains the default in
 * tests. This is the one place that decides, from `AgentConfig.provider`, which
 * `ProviderAdapter` a run actually talks to — every caller downstream only ever sees the
 * `ProviderAdapter` interface, real or stub.
 */
import type { ProviderAdapter, ProviderRequest, ProviderResult } from './provider'
import { LlamaCppProviderAdapter, type LlamaCppConfig } from './llamaCpp'
import { StubModel, type StubModelScript } from './stubModel'
import type { AgentConfig } from './config'

/** Wraps a scripted `StubModel` as a `ProviderAdapter`, so the caller that runs an
 *  agent session cannot tell (and does not need to) whether it is talking to a real
 *  provider or replaying a fixture — both speak the same tool-call shape. */
export class StubProviderAdapter implements ProviderAdapter {
  constructor(private readonly script: StubModelScript) {}

  async run(_request: ProviderRequest): Promise<ProviderResult> {
    const calls = this.script.calls
    return {
      ok: true,
      model: 'stub',
      toolCalls: calls.map((c) => ({ tool: c.tool, args: c.args }))
    }
  }
}

/** `provider: 'none'` — no provider configured at all. Distinct from a real provider
 *  missing its key: this is the config saying "don't try." */
export class NullProviderAdapter implements ProviderAdapter {
  async run(): Promise<ProviderResult> {
    return { ok: false, reason: 'not-configured', message: 'No model is configured. Continue with manual authoring.' }
  }
}

export interface SelectProviderOptions {
  llamaCpp?: LlamaCppConfig
  stubScript?: StubModelScript
}

const EMPTY_STUB_SCRIPT: StubModelScript = { name: 'empty', calls: [] }

export function selectProvider(config: AgentConfig, options: SelectProviderOptions = {}): ProviderAdapter {
  switch (config.provider) {
    case 'llama-cpp':
      return new LlamaCppProviderAdapter({ model: config.model, maxCalls: config.maxProposalsPerRun, ...options.llamaCpp })
    case 'stub':
      return new StubProviderAdapter(options.stubScript ?? EMPTY_STUB_SCRIPT)
    case 'none':
    default:
      return new NullProviderAdapter()
  }
}

// Also re-instantiate the F1 stub model directly where the caller wants proposals, not
// provider-shaped tool calls (e.g. `npm run check`'s offline pipeline test).
export { StubModel }
