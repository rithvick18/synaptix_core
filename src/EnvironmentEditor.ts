import type { LocalProfile } from './LocalProfile'
import { agentConfigStore, needsSetup, ONLINE_MODEL, type AgentConfig } from './agent/config'
import { describeEnvironment } from './agent/environment'
import { geminiConfigFromEnv } from './agent/gemini'
import { receiveImage } from './agent/images'
import { llamaCppConfigFromEnv } from './agent/llamaCpp'
import { selectProvider } from './agent/selectProvider'

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env

/**
 * The one sentence on this form that has to be exactly true, because it is the only
 * place the caregiver is told where their room photographs go — and the answer now
 * depends on the setup mode they chose at start.
 */
function destinationLine(config: AgentConfig): string {
  if (needsSetup(config)) {
    return 'No setup mode is chosen yet. Close this and pick offline or online setup on the level screen, then come back.'
  }
  if (config.setupMode === 'online') {
    return `Generate sends small, metadata-free copies of these photographs, and the notes you type, over the internet to Google's ${config.model || ONLINE_MODEL}. Your original images stay in this browser.`
  }
  return 'Generate sends small, metadata-free copies to the vision model running on this computer. Nothing reaches the internet, and your original images stay here.'
}

/** Offline is a 4B model on your own CPU; online is a request to a datacentre. Saying
 *  "a couple of minutes" in online mode would be describing the wrong machine. */
function waitingLine(config: AgentConfig): string {
  return config.setupMode === 'online'
    ? 'Reading the room and designing your environment…'
    : 'Reading the room and designing your environment… This can take a couple of minutes.'
}

/** UI state survives profile form redraws; only the resulting style is persisted. */
export function environmentEditor(profile: LocalProfile, run: (action: () => Promise<void>) => Promise<void>): HTMLElement {
  const section = document.createElement('section')
  section.innerHTML = `<h3>Build the look of your home from photos</h3>
    <p>Choose up to three room photographs. The vision model matches wall paint, flooring, furniture colours and lighting across the house. The floor plan and furniture shapes stay fixed.</p>
    <label>Room reference photographs<input type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
    <div data-previews style="display:flex;gap:10px;flex-wrap:wrap"></div>
    <label>What should the home look like?<textarea maxlength="2000" placeholder="For example: match the green walls and pale wooden floor."></textarea></label>
    <p data-destination></p>
    <button type="button" data-generate>Generate environment from photos</button>
    <button type="button" data-reset>Reset environment</button>
    <p role="status" aria-live="polite" data-status></p><div data-palette></div>`
  const input = section.querySelector<HTMLInputElement>('input')!
  const notes = section.querySelector('textarea')!
  const status = section.querySelector<HTMLElement>('[data-status]')!
  const previews = section.querySelector<HTMLElement>('[data-previews]')!
  const destination = section.querySelector<HTMLElement>('[data-destination]')!
  // Read on every render and again on click: the mode can change between opening the
  // profile editor and pressing Generate.
  const showDestination = () => { destination.textContent = destinationLine(agentConfigStore.load()) }
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
    const config = agentConfigStore.load()
    showDestination()
    if (needsSetup(config)) throw new Error('Choose offline or online setup on the level screen first — close this, press Setup, then come back.')
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
      status.textContent = waitingLine(config)
      // One call, one environment — `maxProposalsPerRun` is what both adapters cap on.
      const provider = selectProvider({ ...config, maxProposalsPerRun: 1 }, {
        llamaCpp: llamaCppConfigFromEnv(env),
        gemini: geminiConfigFromEnv(env)
      })
      const result = await describeEnvironment(provider, probes, notes.value)
      profile.environment = result.style; profile.environmentModel = result.model
      palette(); status.textContent = 'Environment ready. Review the colours below, then Save and Play.'
    } catch (error) { status.textContent = 'Generation failed. Your previous environment is unchanged.'; throw error }
  })
  section.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = () => { delete profile.environment; delete profile.environmentModel; palette(); status.textContent = 'Default house appearance restored. Save and Play to apply.' }
  showDestination()
  palette()
  return section
}
