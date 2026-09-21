/**
 * §10.9 F4 — the setup screen, shown at start.
 *
 * The first question the app asks is where the model that reads room photographs runs:
 * **offline** on this computer through llama.cpp, or **online** through Google's
 * Gemini API. The screen exists because that is not a technical preference — it is the
 * choice between "nothing leaves this machine" and "downscaled copies of these
 * photographs cross the internet", and a caregiver cannot make it from a `.env` file.
 *
 * So the disclosure is not behind a second dialog: each option renders its own
 * `consentPromptFor(mode)` lists, sent and not-sent, next to the button that chooses
 * it. Choosing *is* answering, which is why the handler records consent — and why
 * `applySetupMode` drops consent whenever the mode actually changes, so the other
 * mode's answer can never stand in for this one's.
 *
 * Deliberately a plain overlay rather than `<dialog showModal>`: a modal makes the
 * rest of the document inert, and the game behind this screen — the loading stages,
 * the level list — has to keep working and keep being reachable by the headless
 * checks. Nothing here blocks the boot; the app loads underneath.
 */
import {
  ONLINE_MODEL,
  SETUP_MODES,
  applySetupMode,
  consentPromptFor,
  type AgentConfig,
  type SetupMode
} from './config'

export interface SetupScreenOptions {
  config: AgentConfig
  /** `VITE_GEMINI_API_KEY`, offered as the starting value of the key field. */
  envApiKey?: string
  /** Called with the new config once a mode is chosen. Persisting is the caller's. */
  onSave(config: AgentConfig): void
  /** Called whenever the screen closes, chosen or dismissed. */
  onClose?(): void
  container?: HTMLElement
}

const TITLE: Record<SetupMode, string> = {
  offline: 'Offline setup — everything on this computer',
  online: 'Online setup — Google Gemini'
}

const BLURB: Record<SetupMode, string> = {
  offline:
    'A llama.cpp server you run yourself reads the room photographs. Nothing reaches the internet, and there is no account and no key. You have to start the server before generating.',
  online:
    `Google's ${ONLINE_MODEL} reads the room photographs. There is nothing to install, and it is faster — but the photographs it reads travel to Google, and you need a Gemini API key.`
}

const START_COMMAND =
  'llama-server -m gemma-3-4b-it-Q4_K_M.gguf --mmproj mmproj-gemma-3-4b-it-f16.gguf --port 8080'

const STYLE = `
#smriti-setup{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:#102419d9;padding:20px;box-sizing:border-box;font:16px/1.5 system-ui}
#smriti-setup .sheet{width:min(760px,96vw);max-height:92vh;overflow:auto;box-sizing:border-box;background:#faf6ee;color:#28392f;border-radius:16px;padding:26px}
#smriti-setup h2{margin:0 0 6px} #smriti-setup h3{margin:0 0 6px;font-size:17px}
#smriti-setup .lede{margin:0 0 16px}
#smriti-setup .mode{border:1px solid #c6cdbd;border-radius:10px;padding:15px;margin:12px 0;background:#fffdf7}
#smriti-setup .mode[data-selected="true"]{border-color:#285a43;box-shadow:0 0 0 2px #285a4333}
#smriti-setup .mode > label{display:flex;gap:9px;align-items:flex-start;font-weight:600;cursor:pointer}
#smriti-setup .mode p{margin:8px 0 0}
#smriti-setup ul{margin:6px 0 0;padding-left:20px} #smriti-setup li{margin:2px 0}
#smriti-setup .sent{color:#7a3b12} #smriti-setup .not-sent{color:#2c5b3f}
#smriti-setup code{background:#eef0e6;border-radius:4px;padding:1px 5px;font:13px/1.5 ui-monospace,monospace;word-break:break-all}
#smriti-setup input[type=text],#smriti-setup input[type=password]{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:9px;border:1px solid #a6b3a7;border-radius:6px;font:inherit;background:white;color:#243b2c}
#smriti-setup button{padding:10px 15px;border:1px solid #879b87;background:#e4eddf;color:#203c2d;border-radius:7px;font:inherit;margin:5px 7px 0 0;cursor:pointer}
#smriti-setup button.primary{background:#285a43;color:white;border-color:#285a43}
#smriti-setup button[disabled]{opacity:.55;cursor:not-allowed}
#smriti-setup .error{color:#8d2919;font-weight:600;min-height:1.5em;margin:10px 0 0}
#smriti-setup footer{margin-top:14px;border-top:1px solid #c6cdbd;padding-top:12px}
#smriti-setup .foot-note{margin:10px 0 0;font-size:14px;color:#4b5a4f}
`

function list(parent: Element, className: string, label: string, items: string[]): void {
  const heading = document.createElement('p')
  heading.className = className
  heading.textContent = label
  const ul = document.createElement('ul')
  ul.className = className
  for (const item of items) {
    const li = document.createElement('li')
    li.textContent = item
    ul.append(li)
  }
  parent.append(heading, ul)
}

/**
 * Opens the screen. Returns the element so a caller can find or remove it; the screen
 * removes itself on Continue or Not now.
 */
export function openSetupScreen(options: SetupScreenOptions): HTMLElement {
  const container = options.container ?? document.body
  const existing = container.querySelector('#smriti-setup')
  if (existing) existing.remove()

  const root = document.createElement('div')
  root.id = 'smriti-setup'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', 'Choose where the model runs')

  const style = document.createElement('style')
  style.textContent = STYLE
  root.append(style)

  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  root.append(sheet)

  const heading = document.createElement('h2')
  heading.textContent = 'Set up Smriti'
  const lede = document.createElement('p')
  lede.className = 'lede'
  lede.textContent =
    'Smriti can build the look of the home from photographs of your own rooms. Choose where the model that reads them runs. Playing a level never uses it — this is only for building the home, and you can change the answer later from the level screen.'
  sheet.append(heading, lede)

  let mode: SetupMode = options.config.setupMode ?? 'offline'
  let apiKey = options.config.apiKey || options.envApiKey || ''

  const panels = new Map<SetupMode, HTMLElement>()
  const error = document.createElement('p')
  error.className = 'error'
  error.setAttribute('role', 'alert')

  const keyInput = document.createElement('input')
  keyInput.type = 'password'
  keyInput.autocomplete = 'off'
  keyInput.spellcheck = false
  keyInput.placeholder = 'AIza…'
  keyInput.value = apiKey
  keyInput.setAttribute('aria-label', 'Gemini API key')
  keyInput.oninput = () => {
    apiKey = keyInput.value
    error.textContent = ''
    refresh()
  }

  const confirm = document.createElement('button')
  confirm.className = 'primary'
  confirm.type = 'button'

  const refresh = (): void => {
    for (const [m, panel] of panels) panel.dataset.selected = String(m === mode)
    confirm.textContent = mode === 'online' ? 'Use online setup' : 'Use offline setup'
    confirm.disabled = mode === 'online' && apiKey.trim().length === 0
  }

  for (const m of SETUP_MODES) {
    const panel = document.createElement('section')
    panel.className = 'mode'
    panel.dataset.mode = m

    const label = document.createElement('label')
    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'smriti-setup-mode'
    radio.value = m
    radio.checked = m === mode
    radio.onchange = () => { if (radio.checked) { mode = m; error.textContent = ''; refresh() } }
    const title = document.createElement('span')
    title.textContent = TITLE[m]
    label.append(radio, title)
    panel.append(label)

    const blurb = document.createElement('p')
    blurb.textContent = BLURB[m]
    panel.append(blurb)

    const prompt = consentPromptFor(m)
    list(panel, 'sent', `Sent to ${prompt.provider}:`, prompt.sent)
    list(panel, 'not-sent', 'Never sent:', prompt.notSent)

    if (m === 'offline') {
      const command = document.createElement('p')
      command.append('Start the server first with: ')
      const code = document.createElement('code')
      code.textContent = START_COMMAND
      command.append(code)
      panel.append(command)
    } else {
      const keyLabel = document.createElement('label')
      keyLabel.style.fontWeight = '400'
      keyLabel.style.display = 'block'
      keyLabel.style.marginTop = '10px'
      keyLabel.append('Gemini API key — kept in this browser, sent only to Google')
      keyLabel.append(keyInput)
      panel.append(keyLabel)
      const where = document.createElement('p')
      where.className = 'foot-note'
      where.textContent = `Create one free at aistudio.google.com/apikey. Model: ${ONLINE_MODEL}.`
      panel.append(where)
    }

    panels.set(m, panel)
    sheet.append(panel)
  }

  sheet.append(error)

  const footer = document.createElement('footer')
  const close = (): void => {
    root.remove()
    options.onClose?.()
  }

  confirm.onclick = () => {
    if (mode === 'online' && !apiKey.trim()) {
      error.textContent = 'Online mode needs a Gemini API key. Paste one, or choose offline setup.'
      return
    }
    // Choosing here is the consent: this screen showed `consentPromptFor(mode)` above
    // the button that was clicked. `applySetupMode` has already dropped any consent
    // carried over from the other mode, so this records an answer to *this* prompt.
    const chosen = applySetupMode(options.config, mode, { apiKey })
    options.onSave({ ...chosen, consentGiven: true })
    close()
  }

  const later = document.createElement('button')
  later.type = 'button'
  later.textContent = options.config.setupMode ? 'Cancel' : 'Decide later — play without it'
  later.onclick = close

  footer.append(confirm, later)
  const note = document.createElement('p')
  note.className = 'foot-note'
  note.textContent =
    'Either way, the levels themselves run entirely in this browser: the game makes no network request while anyone is playing.'
  footer.append(note)
  sheet.append(footer)

  // The player listens for movement keys on the window. Without this, typing an API
  // key walks the patient across the living room.
  root.addEventListener('keydown', (e) => e.stopPropagation())
  root.addEventListener('keyup', (e) => e.stopPropagation())

  refresh()
  container.append(root)
  ;(panels.get(mode)?.querySelector('input[type=radio]') as HTMLElement | null)?.focus()
  return root
}

/** The one-line label the level screen shows on its Setup button. */
export function describeSetup(config: AgentConfig): string {
  if (config.setupMode === 'online') return `Setup: online · ${config.model || ONLINE_MODEL}`
  if (config.setupMode === 'offline') return 'Setup: offline · on this computer'
  return 'Set up online or offline'
}
