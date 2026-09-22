import { environmentEditor } from './EnvironmentEditor'
import { newId, newProfile, profileErrors, profileStore, type LocalProfile, type Photo, type Question } from './LocalProfile'
import { cropRect, importPhoto } from './PhotoMedia'
import { templatePicker } from './TemplatePicker'

export function openProfileEditor(saved: LocalProfile | undefined, maxTextureSize: number, onClose: () => void): void {
  const profile = saved ? structuredClone(saved) : newProfile()
  const dialog = document.createElement('dialog')
  dialog.id = 'profile-editor'
  dialog.innerHTML = `<style>
  #profile-editor{width:min(980px,94vw);max-height:92vh;box-sizing:border-box;background:#faf6ee;color:#28392f;border:0;border-radius:16px;padding:26px;font:16px/1.5 system-ui;overflow:auto}
  #profile-editor::backdrop{background:#102419d9} #profile-editor h2{margin:0 0 8px} #profile-editor h3{margin:12px 0}
  #profile-editor label{display:block;margin:10px 0} #profile-editor input:not([type=checkbox]):not([type=range]),#profile-editor select,#profile-editor textarea{display:block;box-sizing:border-box;width:100%;padding:9px;border:1px solid #a6b3a7;border-radius:6px;font:inherit;background:white;color:#243b2c}
  #profile-editor button{padding:10px 15px;border:1px solid #879b87;background:#e4eddf;color:#203c2d;border-radius:7px;font:inherit;margin:5px 7px 5px 0;cursor:pointer} #profile-editor button.primary{background:#285a43;color:white}
  #profile-editor .slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
  #profile-editor section{border:1px solid #c6cdbd;border-radius:10px;padding:15px;margin:12px 0;background:#fffdf7}
  #profile-editor canvas{display:block;max-width:100%;background:#d5d2c8;border:8px solid #665341;box-sizing:content-box}
  #profile-editor .error{white-space:pre-line;color:#8d2919;font-weight:600} #profile-editor small{display:block} #profile-editor footer{position:sticky;bottom:-26px;background:#faf6ee;padding:12px 0;border-top:1px solid #c6cdbd} </style>
  <h2>Personalise Home</h2><p>Your profiles and original photographs stay in this browser on this device; clearing browser data removes them. Room reference photographs are read only when you choose Generate, by whichever model your setup mode selected — the panel below says which, and where the copies go.</p>
  <div data-main></div><p class="error" role="alert" aria-live="polite"></p><footer></footer>`
  document.body.append(dialog)
  let busy = false
  let previewGeneration = 0
  const urls = new Set<string>()
  const main = dialog.querySelector<HTMLElement>('[data-main]')!
  const error = dialog.querySelector<HTMLElement>('.error')!
  const footer = dialog.querySelector('footer')!
  const release = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear() }
  const close = () => { if (busy) return; previewGeneration++; release(); dialog.close(); dialog.remove(); onClose() }
  dialog.addEventListener('cancel', e => { e.preventDefault(); close() })
  dialog.addEventListener('keydown', e => e.stopPropagation())
  dialog.addEventListener('click', e => e.stopPropagation())
  const message = (e: unknown) => { error.textContent = e instanceof Error ? e.message : String(e) }
  const button = (parent: Element, text: string, action: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text
    b.onclick = action; parent.append(b); return b
  }
  const field = (parent: Element, title: string, value: string, change: (value: string) => void) => {
    const label = document.createElement('label'); label.textContent = title
    const input = document.createElement('input'); input.value = value; input.oninput = () => change(input.value)
    label.append(input); parent.append(label); return input
  }
  const select = (parent: Element, title: string, values: { id: string; label: string }[], value: string, change: (value: string) => void) => {
    const label = document.createElement('label'); label.textContent = title
    const input = document.createElement('select')
    for (const v of [{ id: '', label: 'Choose…' }, ...values]) { const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; input.append(o) }
    input.value = value; input.onchange = () => change(input.value); label.append(input); parent.append(label)
  }
  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return
    busy = true; error.textContent = ''
    dialog.querySelectorAll<HTMLInputElement>('button,input,select,textarea').forEach(b => { b.disabled = true })
    try { await action() } catch (e) { message(e) }
    finally { busy = false; dialog.querySelectorAll<HTMLInputElement>('button,input,select,textarea').forEach(b => { b.disabled = false }) }
  }
  const environmentSection = environmentEditor(profile, run)
  // Built once, like the environment section: its toggles keep their state across render().
  const layoutSection = templatePicker(profile)
  const slot = (parent: Element, title: string, aspect: number, get: () => Photo | undefined, set: (photo?: Photo) => void, extraAspect?: number) => {
    const section = document.createElement('section'); parent.append(section)
    const h = document.createElement('h3'); h.textContent = title; section.append(h)
    const photo = get()
    if (photo) {
      const url = URL.createObjectURL(photo.thumbnail); urls.add(url)
      const img = new Image(); const generation = previewGeneration
      const canvases: { canvas: HTMLCanvasElement; aspect: number }[] = []
      for (const ratio of [aspect, ...(extraAspect ? [extraAspect] : [])]) {
        const canvas = document.createElement('canvas'); canvas.width = 220; canvas.height = Math.round(220 / ratio)
        section.append(canvas); canvases.push({ canvas, aspect: ratio })
      }
      const draw = () => { if (!img.complete || !img.naturalWidth || generation !== previewGeneration) return
        for (const item of canvases) item.canvas.getContext('2d')!.drawImage(img, ...cropRect(img.naturalWidth, img.naturalHeight, item.aspect, photo.crop), 0, 0, item.canvas.width, item.canvas.height)
      }
      img.onload = draw; img.src = url
      for (const [key, title, min, max] of [['x', 'Horizontal position', 0, 1], ['y', 'Vertical position', 0, 1], ['zoom', 'Crop zoom', 1, 3]] as const) {
        const label = document.createElement('label'); label.textContent = title
        const range = document.createElement('input'); range.type = 'range'; range.min = String(min); range.max = String(max); range.step = '.01'; range.value = String(photo.crop[key])
        range.oninput = () => { photo.crop[key] = Number(range.value); draw() }; label.append(range); section.append(label)
      }
      const detail = document.createElement('small'); detail.textContent = `${photo.width} × ${photo.height} runtime image · original preserved`; section.append(detail)
    } else { const empty = document.createElement('p'); empty.textContent = 'No photo selected — neutral frame.'; section.append(empty) }
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; file.hidden = true
    file.setAttribute('aria-label', title)
    file.onchange = () => { const selected = file.files?.[0]; if (selected) void run(async () => { const replacement = await importPhoto(selected, profile.quality, maxTextureSize, get()); set(replacement); render() }) }
    section.append(file)
    button(section, photo ? 'Replace' : 'Upload photograph', () => file.click())
    if (photo) button(section, 'Remove', () => { set(undefined); render() })
  }
  const renderQuestion = (parent: Element, q: Question, index: number) => {
    const section = document.createElement('section'); parent.append(section)
    const h = document.createElement('h3'); h.textContent = `Recall question ${index + 1}`; section.append(h)
    select(section, 'Level', [{ id: '0', label: 'Level 1' }, { id: '2', label: 'Level 3' }], String(q.level), v => { if (v) q.level = Number(v) as 0 | 2 })
    select(section, 'About this photograph / person', [{ id: profile.wallId, label: 'Living-room wall photo' }, { id: profile.eventId, label: 'Event photo' }, ...profile.people.map(p => ({ id: p.id, label: p.name || 'Unnamed person' }))], q.contentId, v => { q.contentId = v })
    field(section, 'Question (your words)', q.question, v => { q.question = v })
    select(section, 'Choice format', [{ id: 'text', label: 'Written choices' }, { id: 'person', label: 'People / portrait cards' }], q.type, v => {
      if (v !== 'text' && v !== 'person') return
      q.type = v; q.answer = ''; q.choices = v === 'person' ? profile.people.map(p => ({ id: p.id, label: p.name })) : Array.from({ length: 3 }, () => ({ id: newId(), label: '' })); render()
    })
    if (q.type === 'text') {
      q.choices.forEach((c, i) => {
        field(section, `Choice ${i + 1}`, c.label, v => { c.label = v })
        if (q.choices.length > 2) button(section, `Remove choice ${i + 1}`, () => { q.choices.splice(i, 1); render() })
      })
      if (q.choices.length < 6) button(section, 'Add choice', () => { q.choices.push({ id: newId(), label: '' }); render() })
    }
    else { const note = document.createElement('p'); note.textContent = 'All entered people are choices. Add at least two people with distinct names.'; section.append(note) }
    select(section, 'Correct answer (explicitly selected by you)', q.choices.map((c, i) => ({ id: c.id, label: q.type === 'person' ? profile.people.find(p => p.id === c.id)?.name || 'Unnamed person' : `Choice ${i + 1}` })), q.answer, v => { q.answer = v })
    field(section, 'First hint / repeat', q.repeat, v => { q.repeat = v })
    field(section, 'Final hint / answer guidance', q.guide, v => { q.guide = v })
    const note = document.createElement('small'); note.textContent = 'The second hint reduces the choices while keeping your selected answer.'; section.append(note)
    button(section, 'Remove question', () => { profile.questions.splice(index, 1); render() })
  }
  const render = () => {
    previewGeneration++; release(); main.replaceChildren()
    field(main, 'Profile display name', profile.name, v => { profile.name = v })
    select(main, 'Photo quality (independent of display pixel ratio)', [{ id: '2048', label: 'Standard — up to 2048 px' }, { id: '4096', label: `High quality — up to ${Math.min(4096, maxTextureSize)} px` }], String(profile.quality), v => { if (v) profile.quality = Number(v) as 2048 | 4096 })
    main.append(layoutSection, environmentSection)
    const slots = document.createElement('div'); slots.className = 'slots'; main.append(slots)
    slot(slots, 'Living-room wall photograph', .95 / .7, () => profile.wall, p => { profile.wall = p })
    slot(slots, 'Event photograph — beside the living-room wall frame', .95 / .7, () => profile.event, p => { profile.event = p })
    field(main, 'Event caption (your words)', profile.caption, v => { profile.caption = v })
    profile.people.forEach((person, index) => {
      const section = document.createElement('section'); main.append(section)
      field(section, 'Person name', person.name, v => { person.name = v })
      field(section, 'Relationship', person.relationship, v => { person.relationship = v })
      slot(section, index === 0 ? 'Portrait — recall card and bedside frame (both previews)' : 'Portrait — recall choice card', 1, () => person.photo, p => { person.photo = p }, index === 0 ? .2 / .26 : undefined)
      button(section, 'Remove person', () => { profile.people.splice(index, 1); render() })
    })
    button(main, 'Add person', () => { profile.people.push({ id: newId(), name: '', relationship: '' }); render() })
    const label = document.createElement('label'); const skip = document.createElement('input'); skip.type = 'checkbox'; skip.checked = profile.skipRecall
    skip.onchange = () => { profile.skipRecall = skip.checked }; label.append(skip, ' Skip personalised recall until valid questions are supplied'); main.append(label)
    const note = document.createElement('p'); note.textContent = 'Image-only profiles can play all three levels. Questions and answers are never inferred from photos, and demo questions are never reused.'; main.append(note)
    profile.questions.forEach((q, i) => {
      if (q.type === 'person') q.choices = profile.people.map(p => ({ id: p.id, label: p.name }))
      renderQuestion(main, q, i)
    })
    button(main, 'Add recall question', () => { profile.questions.push({ id: newId(), contentId: '', level: 0, type: 'text', question: '', choices: Array.from({ length: 3 }, () => ({ id: newId(), label: '' })), answer: '', repeat: '', guide: '' }); render() })
  }
  button(footer, 'Save and Play', () => void run(async () => {
    const errors = profileErrors(profile); if (errors.length) throw new Error(errors.join('\n'))
    // Decode one original at a time, release it immediately. Quality changes apply here.
    if (profile.wall) profile.wall = await importPhoto(profile.wall.original, profile.quality, maxTextureSize, profile.wall)
    if (profile.event) profile.event = await importPhoto(profile.event.original, profile.quality, maxTextureSize, profile.event)
    for (const person of profile.people) if (person.photo) person.photo = await importPhoto(person.photo.original, profile.quality, maxTextureSize, person.photo)
    try { await profileStore.save(profile) } catch { throw new Error('Could not save to browser storage. Your last successfully saved profile is unchanged. Free some storage or allow storage, then retry.') }
    release(); const url = new URL(location.href); url.search = '?play=1'; location.assign(url)
  })).className = 'primary'
  button(footer, 'Cancel', close)
  for (const demo of ['mira', 'raju']) button(footer, `Use Demo Profile — ${demo === 'mira' ? 'Mira' : 'Raju'}`, () => void run(async () => { await profileStore.select(demo); release(); location.assign(`?patient=${demo}`) }))
  if (saved) button(footer, 'Delete Profile', () => {
    error.textContent = 'Delete this saved profile and its original photos from this browser?'
    const confirm = button(footer, 'Confirm Delete Profile', () => void run(async () => { await profileStore.delete(); release(); location.assign('?patient=mira') })); confirm.focus()
  })
  render(); dialog.showModal()
}
