import type { LocalProfile } from './LocalProfile'
import { describeEnvironment } from './agent/environment'
import { receiveImage } from './agent/images'
import { LlamaCppProviderAdapter, llamaCppConfigFromEnv } from './agent/llamaCpp'

/** UI state survives profile form redraws; only the resulting style is persisted. */
export function environmentEditor(profile: LocalProfile, run: (action: () => Promise<void>) => Promise<void>): HTMLElement {
  const section = document.createElement('section')
  section.innerHTML = `<h3>Build the look of your home from photos</h3>
    <p>Choose up to three room photographs. The vision model matches wall paint, flooring, furniture colours and lighting across the house. The floor plan and furniture shapes stay fixed.</p>
    <label>Room reference photographs<input type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
    <div data-previews style="display:flex;gap:10px;flex-wrap:wrap"></div>
    <label>What should the home look like?<textarea maxlength="2000" placeholder="For example: match the green walls and pale wooden floor."></textarea></label>
    <p>Generate sends small, metadata-free copies to the vision model running on this computer. Original images stay here.</p>
    <button type="button" data-generate>Generate environment from photos</button>
    <button type="button" data-reset>Reset environment</button>
    <p role="status" aria-live="polite" data-status></p><div data-palette></div>`
  const input = section.querySelector<HTMLInputElement>('input')!
  const notes = section.querySelector('textarea')!
  const status = section.querySelector<HTMLElement>('[data-status]')!
  const previews = section.querySelector<HTMLElement>('[data-previews]')!
  let files: File[] = []
  let generation = 0
  input.onchange = () => {
    files = Array.from(input.files ?? []); previews.replaceChildren(); const current = ++generation
    for (const file of files.slice(0, 3)) {
      const reader = new FileReader()
      reader.onload = () => { if (generation !== current) return; const img = new Image(); img.src = String(reader.result); img.alt = file.name; img.style.cssText = 'width:130px;height:90px;object-fit:cover;border-radius:6px'; previews.append(img) }
      reader.readAsDataURL(file)
    }
    status.textContent = files.length > 3 ? 'Please choose at most three photographs.' : `${files.length} reference photograph(s) selected.`
  }
  const palette = () => {
    const box = section.querySelector<HTMLElement>('[data-palette]')!; box.replaceChildren()
    if (!profile.environment) return
    for (const key of ['wall', 'floor', 'wood', 'fabric', 'accent'] as const) {
      const label = document.createElement('label'); label.style.display = 'inline-block'; label.style.marginRight = '16px'; label.textContent = key + ' '
      const color = document.createElement('input'); color.type = 'color'; color.value = profile.environment[key]
      color.oninput = () => { if (profile.environment) profile.environment[key] = color.value }
      label.append(color); box.append(label)
    }
    const details = document.createElement('p'); details.textContent = `${profile.environment.floorType} flooring · ${profile.environment.light} lighting. Save and Play applies this to the 3D home.`; box.append(details)
  }
  section.querySelector<HTMLButtonElement>('[data-generate]')!.onclick = () => void run(async () => {
    if (!files.length || files.length > 3) throw new Error('Choose one to three room photographs first.')
    status.textContent = 'Preparing photographs…'
    try {
      const probes = []
      for (const [i, file] of files.entries()) {
        const { probe } = await receiveImage(file)
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read photograph.')); reader.readAsDataURL(probe)
        })
        probes.push({ assetId: `room-${i}`, mimeType: 'image/jpeg' as const, base64 })
      }
      status.textContent = 'Reading the room and designing your environment… This can take a couple of minutes.'
      const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
      const result = await describeEnvironment(new LlamaCppProviderAdapter({ ...llamaCppConfigFromEnv(env), maxCalls: 1 }), probes, notes.value)
      profile.environment = result.style; profile.environmentModel = result.model
      palette(); status.textContent = 'Environment ready. Review the colours below, then Save and Play.'
    } catch (error) { status.textContent = 'Generation failed. Your previous environment is unchanged.'; throw error }
  })
  section.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = () => { delete profile.environment; delete profile.environmentModel; palette(); status.textContent = 'Default house appearance restored. Save and Play to apply.' }
  palette()
  return section
}
