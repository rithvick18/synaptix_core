import type { LocalProfile } from './LocalProfile'
import { TEMPLATES } from './templates'
import { planSvg } from './templates/plan'

/**
 * SPEC.md §11.7 — "Choose your home's layout". Four cards, each a plan drawn from the
 * template data, a one-line description and its own mirror toggle.
 *
 * Writes only `profile.templateId` and `profile.mirrored`. Photographs, crops, people
 * and questions are not reachable from here, so changing the layout cannot touch them.
 * Nothing is saved until Save and Play, which commits the whole profile in the one
 * IndexedDB transaction (§9).
 */
export function templatePicker(profile: LocalProfile): HTMLElement {
  const section = document.createElement('section')
  section.dataset.templatePicker = ''
  section.innerHTML = `<style>
  [data-template-picker] .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
  [data-template-picker] .card{border:2px solid #c6cdbd;border-radius:10px;padding:10px;background:#fffdf7}
  [data-template-picker] .card.selected{border-color:#285a43;background:#f1f6ee}
  [data-template-picker] .card label{margin:4px 0} [data-template-picker] .card p{margin:6px 0;font-size:14px}
  [data-template-picker] .plan svg{display:block;width:100%;height:auto;border-radius:4px;cursor:pointer}
  #profile-editor [data-template-picker] .card input[type=radio]{display:inline;width:auto;margin:0 6px 0 0;padding:0}
  [data-template-picker] .card label.name{font-weight:600}</style>
  <h3>Choose your home's layout</h3>
  <p>Pick the shape closest to the home your relative knows. It is not a copy of that home — your photographs do the recognising. Changing the layout keeps your photographs, people and questions as they are.</p>
  <div class="cards" role="radiogroup" aria-label="Home layout"></div>`
  const cards = section.querySelector('.cards')!
  // Each card keeps its own toggle; the selected card's toggle is the profile's.
  const mirrors = new Map(Object.keys(TEMPLATES).map(id => [id, id === profile.templateId && profile.mirrored]))
  const refresh = () => {
    for (const card of cards.querySelectorAll<HTMLElement>('.card')) card.classList.toggle('selected', card.dataset.template === profile.templateId)
  }
  for (const template of Object.values(TEMPLATES)) {
    const card = document.createElement('div'); card.className = 'card'; card.dataset.template = template.id
    const pick = document.createElement('label'); pick.className = 'name'
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'home-layout'; radio.value = template.id
    radio.checked = template.id === profile.templateId
    pick.append(radio, ' ', template.name)
    const plan = document.createElement('div'); plan.className = 'plan'
    const draw = () => { plan.innerHTML = planSvg(template, mirrors.get(template.id)!) }
    const description = document.createElement('p'); description.textContent = template.description
    const flip = document.createElement('label')
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.dataset.mirror = ''
    toggle.checked = mirrors.get(template.id)!
    flip.append(toggle, ' Flip left to right')
    radio.onchange = () => { if (!radio.checked) return; profile.templateId = template.id; profile.mirrored = toggle.checked; refresh() }
    toggle.onchange = () => {
      mirrors.set(template.id, toggle.checked); draw()
      if (profile.templateId === template.id) profile.mirrored = toggle.checked
    }
    // The plan is a picture of the choice; clicking it chooses, as the name does.
    plan.onclick = () => { radio.checked = true; radio.onchange?.(new Event('change')) }
    draw()
    card.append(pick, plan, description, flip); cards.append(card)
  }
  refresh()
  return section
}
