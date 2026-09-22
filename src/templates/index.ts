/**
 * SPEC.md §11.1 — the template registry.
 *
 * Adding a template means adding a data file and registering it here. Every registered
 * template is audited in both orientations by `npm run check` and
 * `npm run check:offline` (§11.5); a template that fails cannot be shipped by leaving
 * it out of this list, because this list is what ships.
 */
import { hallway } from './hallway'
import type { Template } from './types'

export const TEMPLATES: Readonly<Record<string, Template>> = { hallway }

export const DEFAULT_TEMPLATE_ID = 'hallway'

export interface TemplateSelection {
  template: Template
  mirror: boolean
  /** Set when `?template=` named something that is not registered. */
  problem: string | null
}

/**
 * The `?template=<id>&mirror=1` dev override (§11.7). Without it the house is the
 * default template, unmirrored — which is what the Mira and Raju demos always use.
 * An unknown id falls back to the default and says so, rather than failing the boot.
 */
export function templateFromLocation(search: string): TemplateSelection {
  const params = new URLSearchParams(search)
  const id = params.get('template')
  const mirror = params.get('mirror') === '1'
  if (id !== null && !Object.hasOwn(TEMPLATES, id)) {
    return {
      template: TEMPLATES[DEFAULT_TEMPLATE_ID],
      mirror,
      problem: `?template=${id} is not a registered template (${Object.keys(TEMPLATES).join(', ')}); using ${DEFAULT_TEMPLATE_ID}`
    }
  }
  return { template: TEMPLATES[id ?? DEFAULT_TEMPLATE_ID], mirror, problem: null }
}
