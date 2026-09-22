/**
 * SPEC.md §11.1 — the template registry.
 *
 * Adding a template means adding a data file and registering it here. Every registered
 * template is audited in both orientations by `npm run check` and
 * `npm run check:offline` (§11.5); a template that fails cannot be shipped by leaving
 * it out of this list, because this list is what ships.
 */
import { courtyard } from './courtyard'
import { hallway } from './hallway'
import { openPlan } from './openPlan'
import { row } from './row'
import type { Template } from './types'

export const TEMPLATES: Readonly<Record<string, Template>> = { hallway, row, openPlan, courtyard }

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

/** §11.7 — what a local profile stores about its house. */
export interface HouseChoice {
  templateId: string
  mirrored: boolean
}

export const DEFAULT_HOUSE: Readonly<HouseChoice> = { templateId: DEFAULT_TEMPLATE_ID, mirrored: false }

/**
 * Which house to build. `?template=` wins over everything, as a dev override (§11.7).
 * Otherwise a local profile gets the layout the caregiver chose, and a demo pack — no
 * profile — gets `templateFromLocation`'s answer, which is the default house unless the
 * URL says otherwise. A stored id that is no longer registered falls back the same way
 * an unknown `?template=` does.
 */
export function houseFor(search: string, profile: HouseChoice | undefined): TemplateSelection {
  if (!profile || new URLSearchParams(search).has('template')) return templateFromLocation(search)
  if (!Object.hasOwn(TEMPLATES, profile.templateId)) {
    return {
      template: TEMPLATES[DEFAULT_TEMPLATE_ID],
      mirror: false,
      problem: `the saved profile's layout "${profile.templateId}" is not a registered template; using ${DEFAULT_TEMPLATE_ID}`
    }
  }
  return { template: TEMPLATES[profile.templateId], mirror: profile.mirrored, problem: null }
}
