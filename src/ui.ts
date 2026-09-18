/**
 * SPEC.md §3 — HUD, hints, answer cards, loader, summary.
 *
 * Checkpoint A needs only the loader, the crosshair, the centre interaction prompt, the
 * state/room HUD and the performance readout. Hints, answer cards and the summary arrive
 * with Checkpoints B–D; nothing here presumes their shape.
 */

const STYLE = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #0e0f11;
  font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #f2efe9; }
canvas { display: block; }
#hud { position: fixed; inset: 0; pointer-events: none; }
#crosshair { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px;
  margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(255,255,255,.75);
  box-shadow: 0 0 0 1px rgba(0,0,0,.45); transition: transform .12s ease, background .12s ease; }
#crosshair.active { transform: scale(1.7); background: #ffd98a; }
#prompt { position: absolute; left: 50%; top: calc(50% + 36px); transform: translateX(-50%);
  padding: 7px 14px; border-radius: 999px; background: rgba(16,17,20,.82);
  border: 1px solid rgba(255,255,255,.14); white-space: nowrap; opacity: 0;
  transition: opacity .12s ease; font-size: 14px; }
#prompt.show { opacity: 1; }
#prompt kbd { display: inline-block; min-width: 20px; padding: 1px 5px; margin-right: 6px;
  border-radius: 4px; background: #f2efe9; color: #14161a; font: 600 12px/1.5 inherit;
  text-align: center; }
#hudTop { position: absolute; top: 14px; left: 14px; padding: 9px 12px; border-radius: 10px;
  background: rgba(16,17,20,.7); border: 1px solid rgba(255,255,255,.1);
  font-variant-numeric: tabular-nums; }
#hudTop b { font-weight: 600; color: #ffd98a; }
#perf { position: absolute; top: 14px; right: 14px; padding: 9px 12px; border-radius: 10px;
  background: rgba(16,17,20,.7); border: 1px solid rgba(255,255,255,.1);
  font-variant-numeric: tabular-nums; text-align: right; white-space: pre; font-size: 12px; }
#log { position: absolute; bottom: 14px; left: 14px; max-width: 46ch; display: flex;
  flex-direction: column; gap: 5px; }
#log div { padding: 6px 10px; border-radius: 8px; background: rgba(16,17,20,.72);
  border: 1px solid rgba(255,255,255,.1); font-size: 12.5px; }
#overlay { position: fixed; inset: 0; display: grid; place-items: center; z-index: 5;
  background: rgba(8,9,11,.88); backdrop-filter: blur(3px); text-align: center; padding: 24px; }
#overlay[hidden] { display: none; }
#overlay .card { max-width: 420px; }
#overlay h1 { margin: 0 0 6px; font-size: 21px; font-weight: 600; letter-spacing: -.01em; }
#overlay p { margin: 0 0 4px; color: #b5b0a6; }
#overlay .keys { margin-top: 16px; color: #8d8880; font-size: 12.5px; }
#bar { width: 220px; height: 3px; margin: 18px auto 0; border-radius: 2px;
  background: rgba(255,255,255,.14); overflow: hidden; }
#bar i { display: block; height: 100%; width: 35%; background: #ffd98a;
  animation: slide 1.1s ease-in-out infinite; }
@keyframes slide { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }
`

export class UI {
  private promptEl!: HTMLElement
  private crosshairEl!: HTMLElement
  private hudTopEl!: HTMLElement
  private perfEl!: HTMLElement
  private logEl!: HTMLElement
  private overlayEl!: HTMLElement
  private overlayCard!: HTMLElement

  constructor(parent: HTMLElement) {
    const style = document.createElement('style')
    style.textContent = STYLE
    document.head.appendChild(style)

    const hud = document.createElement('div')
    hud.id = 'hud'
    hud.innerHTML = `
      <div id="crosshair"></div>
      <div id="prompt"></div>
      <div id="hudTop"></div>
      <div id="perf"></div>
      <div id="log"></div>`
    parent.appendChild(hud)

    const overlay = document.createElement('div')
    overlay.id = 'overlay'
    overlay.innerHTML = `<div class="card"></div>`
    parent.appendChild(overlay)

    this.promptEl = hud.querySelector('#prompt')!
    this.crosshairEl = hud.querySelector('#crosshair')!
    this.hudTopEl = hud.querySelector('#hudTop')!
    this.perfEl = hud.querySelector('#perf')!
    this.logEl = hud.querySelector('#log')!
    this.overlayEl = overlay
    this.overlayCard = overlay.querySelector('.card')!
  }

  showLoading(message: string): void {
    this.overlayCard.innerHTML = `<h1>Smriti</h1><p>${message}</p><div id="bar"><i></i></div>`
    this.overlayEl.hidden = false
  }

  showMessage(title: string, lines: string[], keys?: string): void {
    this.overlayCard.innerHTML =
      `<h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join('')}` +
      (keys ? `<div class="keys">${keys}</div>` : '')
    this.overlayEl.hidden = false
  }

  hideOverlay(): void {
    this.overlayEl.hidden = true
  }

  setPrompt(text: string | null): void {
    if (text) {
      this.promptEl.innerHTML = text
      this.promptEl.classList.add('show')
      this.crosshairEl.classList.add('active')
    } else {
      this.promptEl.classList.remove('show')
      this.crosshairEl.classList.remove('active')
    }
  }

  setHud(html: string): void {
    this.hudTopEl.innerHTML = html
  }

  setPerf(text: string): void {
    this.perfEl.textContent = text
  }

  /** Checkpoint A's "E logs an event": visible on screen as well as in the console. */
  log(message: string): void {
    const line = document.createElement('div')
    line.textContent = message
    this.logEl.appendChild(line)
    while (this.logEl.childElementCount > 4) this.logEl.removeChild(this.logEl.firstElementChild!)
    setTimeout(() => line.remove(), 6000)
  }
}
