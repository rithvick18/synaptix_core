export const escapeText = (text: string): string => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/**
 * SPEC.md §3 — HUD, hints, answer cards, loader, summary.
 *
 * Checkpoint A brought the loader, crosshair, centre prompt, state HUD and perf readout.
 * Checkpoint B adds the mission furniture: the instruction banner, the hint line, the
 * recall answer card and the completion screen.
 *
 * Two rules from §5.4 shape everything below and are worth stating where the markup is:
 * **nothing ever shows "wrong", a red cross, a countdown or a score**, and the answer
 * card is the one part of the HUD that takes pointer events, because §5.1 releases the
 * pointer on purpose to let the player click it.
 */

export interface ChoiceCard {
  id: string
  name: string
  /**
   * The second line of the card: a person's relationship, or a text option's `detail`.
   * Empty when the caregiver wrote none — the line is then omitted rather than shown
   * blank, so a set of bare labels does not sit above a row of empty space.
   */
  relationship: string
  /**
   * A photo URL that is already known to decode, or null for a text card (§4.2).
   * The mixing rule is enforced at render time, not trusted from the caller.
   */
  photoUrl?: string | null
  /** Whether clicking this card will speak. Purely a cue that sound is coming. */
  hasVoice?: boolean
}

/**
 * How a loader reports its own progress to the loading screen. Imported as a *type* by
 * Renderer.ts, proceduralHouse.ts and MemoryPack.ts, so nothing outside this file gains
 * a runtime dependency on the UI — they describe what they are doing, ui.ts decides how
 * it looks.
 */
export type StageProgress = (stage: string, done: number, failed: number, total: number) => void

/**
 * One stage of the loading screen. §6 Checkpoint D asks for stage plus asset count —
 * **item counts, never a synthetic byte percentage**. A progress bar drawn from bytes
 * nobody measured is a lie told to a caregiver waiting on a slow connection, and the
 * three downloads here have wildly different sizes anyway. A stage with no downloads
 * (building geometry) carries no counts at all rather than a made-up denominator.
 */
export interface LoadStage {
  id: string
  label: string
  state: 'waiting' | 'active' | 'done'
  counts: { done: number; failed: number; total: number } | null
  /** Shown instead of counts — e.g. which optional asset fell back. */
  note?: string | null
}

/** One row of the level-selection screen. All three levels are always available. */
export interface LevelChoice {
  /** "Level 1", "Level 2" — the engine's own positional label, not pack content. */
  ordinal: string
  title: string
  /** The caregiver's one-line description, or empty if the pack wrote none. */
  description: string
  /** How many steps, and of what kind — engine chrome, counted from the mission. */
  shape: string
  /** Set once this level has been finished at least once this page-load. */
  finished: boolean
  onStart: () => void
}

/**
 * The level-selection screen (§9 of the level brief). Every level is startable at any
 * time — nothing is locked behind finishing another, because a caregiver setting up a
 * session should be able to open the one they want.
 */
export interface LevelSelectView {
  onPersonalise?: () => void
  personalisationLabel?: string
  /**
   * Opens the agent-assisted setup screen (SPEC.md §10). Present only when
   * `agent.enabled` is true, which it is not in a shipped build — so by default this is
   * undefined and no button is rendered. It lives here, on the level-select screen,
   * because §10.1 requires it be unreachable during a patient session.
   */
  onCaregiverSetup?: () => void
  caregiverSetupLabel?: string
  storageWarning?: string
  title: string
  subtitle: string
  levels: LevelChoice[]
  /**
   * Shown when the pack declares itself demonstration content. A pack describing a real
   * patient carries no notice and this is null, so the label can never be mistaken for
   * decoration that is always there.
   */
  demoNotice?: string | null
  keys?: string
}

/** What the summary card renders. Telemetry.ts computes it; ui.ts only lays it out. */
export interface SummaryView {
  title: string
  subtitle: string
  /** All four §4.3 outcomes, in a fixed order, never summed. */
  outcomes: { label: string; count: number }[]
  measures: { label: string; value: string; note?: string | null }[]
  steps: { label: string; outcome: string; durationMs: number | null }[]
  notDiagnostic: string
  keys?: string
  onExport: () => void
  /** Another attempt at the level just finished. */
  onReplay: () => void
  /** Back to the level-selection screen. */
  onLevels: () => void
  /** Null on the last level — the button is then absent rather than disabled. */
  onNext?: (() => void) | null
  nextLabel?: string | null
}

/** One row of the pack-rejection list. Mirrors MemoryPack's `PackProblem`. */
export interface RenderedProblem {
  severity: 'reject' | 'warn'
  where: string
  message: string
}

export interface AnswerCardOptions {
  memory?: { photo?: string; caption: string }
  question: string
  choices: ChoiceCard[]
  /** Set once level-3 guidance has revealed the answer (§5.4). Never marks anything wrong. */
  revealedId?: string | null
  /**
   * A neutral line under the choices — never "wrong", never a count of attempts (§5.4).
   * A hint, once shown, takes this slot instead.
   */
  note?: string | null
  onSelect: (id: string) => void
  onSkip: () => void
  /** Shown only after a reveal — the acknowledgement that ends the step as `revealed`. */
  onContinue?: () => void
}

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
#prompt kbd, .keycap { display: inline-block; min-width: 20px; padding: 1px 5px; margin-right: 6px;
  border-radius: 4px; background: #f2efe9; color: #14161a; font: 600 12px/1.5 inherit;
  text-align: center; }
#hudTop { position: absolute; top: 14px; left: 14px; padding: 9px 12px; border-radius: 10px;
  background: rgba(16,17,20,.7); border: 1px solid rgba(255,255,255,.1);
  font-variant-numeric: tabular-nums; }
#hudTop b { font-weight: 600; color: #ffd98a; }
#perf { position: absolute; top: 14px; right: 14px; padding: 9px 12px; border-radius: 10px;
  background: rgba(16,17,20,.7); border: 1px solid rgba(255,255,255,.1);
  font-variant-numeric: tabular-nums; text-align: right; white-space: pre; font-size: 12px; }
#log { position: absolute; bottom: 60px; left: 14px; max-width: 46ch; display: flex;
  flex-direction: column; gap: 5px; }
#log div { padding: 6px 10px; border-radius: 8px; background: rgba(16,17,20,.72);
  border: 1px solid rgba(255,255,255,.1); font-size: 12.5px; }

/* --- Mission banner: the current instruction, always on screen while exploring --- */
#mission { position: absolute; top: 70px; left: 50%; transform: translateX(-50%);
  width: min(560px, calc(100vw - 48px)); display: flex; flex-direction: column;
  align-items: center; gap: 8px; text-align: center; }
#mission[hidden] { display: none; }
#instruction { padding: 11px 20px; border-radius: 12px; background: rgba(16,17,20,.82);
  border: 1px solid rgba(255,255,255,.14); font-size: 17px; line-height: 1.35; }
#instruction .step { display: block; margin-bottom: 3px; font-size: 11.5px;
  letter-spacing: .09em; text-transform: uppercase; color: #8d8880; }
/* Which level is being played, above the step — on screen for the whole attempt. */
#instruction .level { display: block; margin-bottom: 4px; font-size: 12.5px;
  font-weight: 600; letter-spacing: .03em; color: #ffd98a; }
#hint { padding: 9px 16px; border-radius: 10px; background: rgba(255,217,138,.13);
  border: 1px solid rgba(255,217,138,.35); color: #ffe7b4; font-size: 14.5px; }
#hint[hidden] { display: none; }

/* --- Controls pill: skip is always available (§5.4) --- */
#controls { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
  padding: 7px 13px; border-radius: 999px; background: rgba(16,17,20,.7);
  border: 1px solid rgba(255,255,255,.1); font-size: 12.5px; color: #b5b0a6; }
#controls[hidden] { display: none; }

/* --- Answer card: the only pointer-interactive part of the HUD (§5.1) --- */
#answer { position: fixed; inset: 0; z-index: 4; display: grid; place-items: center;
  padding: 24px; pointer-events: auto; background: rgba(8,9,11,.55);
  backdrop-filter: blur(2px); }
#answer[hidden] { display: none; }
#answer .sheet { width: min(680px, 100%); padding: 26px 26px 20px; border-radius: 18px;
  background: rgba(20,22,26,.96); border: 1px solid rgba(255,255,255,.13);
  box-shadow: 0 24px 70px rgba(0,0,0,.5); text-align: center; }
#answer h2 { margin: 0 0 18px; font-size: 22px; font-weight: 600; line-height: 1.3;
  letter-spacing: -.01em; }
#answer .choices { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
#answer button.choice { flex: 1 1 170px; max-width: 220px; padding: 18px 14px;
  border-radius: 14px; border: 1px solid rgba(255,255,255,.16); background: #23262c;
  color: #f2efe9; font: inherit; cursor: pointer; text-align: center;
  transition: transform .12s ease, border-color .12s ease, background .12s ease; }
#answer button.choice:hover { transform: translateY(-2px); border-color: rgba(255,217,138,.6);
  background: #2a2e35; }
#answer button.choice.photo { padding: 0 0 14px; overflow: hidden; }
#answer button.choice .portrait { display: block; width: 100%; aspect-ratio: 1 / 1;
  object-fit: cover; background: #1a1c20; margin-bottom: 12px; }
#answer button.choice .name { display: block; font-size: 18px; font-weight: 600; }
#answer button.choice .rel { display: block; margin-top: 3px; font-size: 13px; color: #b5b0a6; }
#answer button.choice .voice { display: block; margin-top: 6px; font-size: 11.5px;
  letter-spacing: .07em; text-transform: uppercase; color: #8d8880; }
/* The reveal marks the answer. There is no counterpart for a wrong choice, by design. */
#answer button.choice.revealed { border-color: #ffd98a; background: #33302a; }
#answer button.choice .tag { display: none; }
#answer button.choice.revealed .tag { display: block; margin-top: 8px; font-size: 11.5px;
  letter-spacing: .08em; text-transform: uppercase; color: #ffd98a; }
#answer .note { margin: 18px 0 0; min-height: 1.45em; color: #ffe7b4; font-size: 14.5px; }
#answer .actions { margin-top: 16px; display: flex; justify-content: center; gap: 10px; }
#answer .actions button { padding: 9px 18px; border-radius: 10px; font: inherit;
  cursor: pointer; border: 1px solid rgba(255,255,255,.18); background: transparent;
  color: #b5b0a6; }
#answer .actions button:hover { color: #f2efe9; border-color: rgba(255,255,255,.35); }
#answer .actions button.primary { background: #ffd98a; border-color: #ffd98a; color: #14161a;
  font-weight: 600; }

#overlay { position: fixed; inset: 0; display: grid; place-items: center; z-index: 5;
  background: rgba(8,9,11,.88); backdrop-filter: blur(3px); text-align: center; padding: 24px; }
#overlay[hidden] { display: none; }
#overlay .card { max-width: 460px; }
#overlay h1 { margin: 0 0 6px; font-size: 21px; font-weight: 600; letter-spacing: -.01em; }
#overlay p { margin: 0 0 4px; color: #b5b0a6; }
#overlay .keys { margin-top: 16px; color: #8d8880; font-size: 12.5px; }
/* Pack rejection (§4.2): every problem at once, so one reload shows the whole list. */
#overlay .card.wide { max-width: 760px; }
#overlay .problems { margin: 16px 0 0; padding: 0; list-style: none; text-align: left;
  max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; gap: 7px; }
#overlay .problems li { padding: 9px 12px; border-radius: 9px; background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1); font-size: 13px; }
#overlay .problems li.warn { border-style: dashed; opacity: .8; }
#overlay .problems .where { display: block; font: 12px/1.5 ui-monospace, SFMono-Regular,
  Menlo, monospace; color: #ffd98a; }
#overlay .problems .sev { float: right; margin-left: 12px; font-size: 11px;
  letter-spacing: .08em; text-transform: uppercase; color: #8d8880; }
#overlay .outcomes { margin: 16px auto 0; display: flex; flex-direction: column; gap: 6px;
  text-align: left; max-width: 360px; }
#overlay .outcomes div { display: flex; justify-content: space-between; gap: 16px;
  padding: 8px 12px; border-radius: 9px; background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.08); font-size: 13px; }
#overlay .outcomes b { font-weight: 600; color: #ffd98a; }
/* --- Loading stages: item counts, never a byte percentage --- */
#overlay .stages { margin: 18px auto 0; display: flex; flex-direction: column; gap: 6px;
  text-align: left; max-width: 340px; }
#overlay .stages div { display: flex; align-items: baseline; justify-content: space-between;
  gap: 14px; padding: 7px 12px; border-radius: 9px; background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07); font-size: 13px; color: #8d8880; }
#overlay .stages div.active { color: #f2efe9; border-color: rgba(255,217,138,.35);
  background: rgba(255,217,138,.09); }
#overlay .stages div.done { color: #b5b0a6; }
#overlay .stages .count { font-variant-numeric: tabular-nums; font-size: 12.5px;
  white-space: nowrap; color: #8d8880; }
#overlay .stages div.active .count { color: #ffd98a; }
#overlay .stages .mark { display: inline-block; width: 1.1em; }

/* --- Level selection. Three rows, each a title, a line of description and Start. --- */
#overlay .card.levels { max-width: 640px; width: min(640px, 100%); }
#overlay .levelList { margin: 20px 0 0; display: flex; flex-direction: column; gap: 10px; }
#overlay .levelList div { display: grid; grid-template-columns: 1fr auto; gap: 14px;
  align-items: center; padding: 14px 16px; border-radius: 12px; text-align: left;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); }
#overlay .levelList .ord { display: block; font-size: 11.5px; letter-spacing: .09em;
  text-transform: uppercase; color: #8d8880; }
#overlay .levelList .name { display: block; margin-top: 2px; font-size: 17px; color: #f2efe9; }
#overlay .levelList .desc { display: block; margin-top: 4px; font-size: 13px; line-height: 1.4;
  color: #b5b0a6; }
#overlay .levelList .shape { display: block; margin-top: 5px; font-size: 11.5px; color: #6f6b64; }
#overlay .levelList .done { color: #ffd98a; }
#overlay .levelList button { padding: 9px 20px; border-radius: 10px; font: inherit;
  cursor: pointer; border: 1px solid #ffd98a; background: #ffd98a; color: #14161a;
  font-weight: 600; }
#overlay .levelList button:hover { filter: brightness(1.07); }
/* The pack's own statement that its people and memories are invented. */
#overlay .demo { margin: 16px auto 0; padding: 9px 14px; border-radius: 9px;
  background: rgba(255,217,138,.1); border: 1px solid rgba(255,217,138,.3);
  color: #ffe7b4; font-size: 12.5px; line-height: 1.45; }

/* --- Summary card (§4.4). No score, no grade, no colour-coded judgement. --- */
#overlay .card.summary { max-width: 640px; width: min(640px, 100%); }
#overlay .notdx { margin: 14px auto 0; padding: 8px 14px; border-radius: 9px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12);
  color: #b5b0a6; font-size: 12.5px; letter-spacing: .02em; }
#overlay .outcomeGrid { margin: 18px 0 0; display: grid; gap: 8px;
  grid-template-columns: repeat(4, 1fr); }
#overlay .outcomeGrid div { padding: 12px 8px; border-radius: 11px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
#overlay .outcomeGrid b { display: block; font-size: 24px; font-weight: 600; color: #f2efe9;
  font-variant-numeric: tabular-nums; }
#overlay .outcomeGrid span { display: block; margin-top: 2px; font-size: 11.5px;
  letter-spacing: .06em; text-transform: uppercase; color: #8d8880; }
#overlay .measures { margin: 10px 0 0; display: grid; gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
#overlay .measures div { padding: 10px 12px; border-radius: 10px; text-align: left;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
#overlay .measures b { display: block; font-size: 17px; font-weight: 600;
  font-variant-numeric: tabular-nums; }
#overlay .measures span { display: block; margin-top: 1px; font-size: 11.5px; color: #8d8880; }
#overlay .measures em { font-style: normal; color: #6f6b64; }
#overlay .stepTable { margin: 12px 0 0; display: flex; flex-direction: column; gap: 5px; }
#overlay .stepTable div { display: grid; grid-template-columns: 1fr auto auto;
  gap: 12px; align-items: baseline; padding: 8px 12px; border-radius: 9px; text-align: left;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); font-size: 12.5px; }
#overlay .stepTable .o { color: #ffd98a; font-weight: 600; }
#overlay .stepTable .n { color: #8d8880; font-variant-numeric: tabular-nums; }
#overlay .actions { margin-top: 18px; display: flex; justify-content: center; gap: 10px;
  flex-wrap: wrap; }
#overlay .actions button { padding: 9px 18px; border-radius: 10px; font: inherit;
  cursor: pointer; border: 1px solid rgba(255,255,255,.18); background: transparent;
  color: #b5b0a6; }
#overlay .actions button:hover { color: #f2efe9; border-color: rgba(255,255,255,.35); }
#overlay .actions button.primary { background: #ffd98a; border-color: #ffd98a;
  color: #14161a; font-weight: 600; }

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
  private missionEl!: HTMLElement
  private instructionEl!: HTMLElement
  private hintEl!: HTMLElement
  private controlsEl!: HTMLElement
  private answerEl!: HTMLElement

  /** Kept so the hint line can be re-rendered into the answer card when one is open. */
  private hintText: string | null = null
  private card: AnswerCardOptions | null = null
  private controlsHtml: string | null | undefined = undefined

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
      <div id="mission" hidden>
        <div id="instruction"></div>
        <div id="hint" hidden></div>
      </div>
      <div id="controls" hidden></div>
      <div id="log"></div>`
    parent.appendChild(hud)

    const answer = document.createElement('div')
    answer.id = 'answer'
    answer.hidden = true
    answer.innerHTML = `<div class="sheet"></div>`
    parent.appendChild(answer)

    const overlay = document.createElement('div')
    overlay.id = 'overlay'
    overlay.innerHTML = `<div class="card"></div>`
    parent.appendChild(overlay)

    this.promptEl = hud.querySelector('#prompt')!
    this.crosshairEl = hud.querySelector('#crosshair')!
    this.hudTopEl = hud.querySelector('#hudTop')!
    this.perfEl = hud.querySelector('#perf')!
    this.logEl = hud.querySelector('#log')!
    this.missionEl = hud.querySelector('#mission')!
    this.instructionEl = hud.querySelector('#instruction')!
    this.hintEl = hud.querySelector('#hint')!
    this.controlsEl = hud.querySelector('#controls')!
    this.answerEl = answer
    this.overlayEl = overlay
    this.overlayCard = overlay.querySelector('.card')!
  }

  // --- Overlays ---------------------------------------------------------------

  showLoading(message: string): void {
    this.overlayCard.classList.remove('wide', 'summary', 'levels')
    this.overlayCard.innerHTML = `<h1>Smriti</h1><p>${message}</p><div id="bar"><i></i></div>`
    this.overlayEl.hidden = false
  }

  showMessage(title: string, lines: string[], keys?: string): void {
    this.overlayCard.classList.remove('wide', 'summary', 'levels')
    this.overlayCard.innerHTML =
      `<h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join('')}` +
      (keys ? `<div class="keys">${keys}</div>` : '')
    this.overlayEl.hidden = false
  }

  /**
   * The loading screen, as stages with **item counts**. Re-rendered on every tick, so it
   * is cheap on purpose: one innerHTML of a handful of rows.
   *
   * A failed optional download is shown as a count, not hidden — §1.1 says the scene
   * must still play without it, and a caregiver debugging a slow site deserves to see
   * "11/12, 1 fell back" rather than a bar that silently reached the end.
   */
  showLoadingStages(title: string, stages: LoadStage[]): void {
    this.overlayCard.classList.remove('wide', 'summary', 'levels')
    this.overlayCard.innerHTML =
      `<h1>Smriti</h1><p>${title}</p>` +
      `<div class="stages">${stages
        .map((stage) => {
          const mark = stage.state === 'done' ? '✓' : stage.state === 'active' ? '·' : ' '
          const counts = stage.counts
          const count = stage.note
            ? stage.note
            : counts
              ? `${counts.done + counts.failed}/${counts.total}` +
                (counts.failed > 0 ? ` · ${counts.failed} fell back` : '')
              : ''
          return (
            `<div class="${stage.state}"><span><span class="mark">${mark}</span>${stage.label}</span>` +
            `<span class="count">${count}</span></div>`
          )
        })
        .join('')}</div>`
    this.overlayEl.hidden = false
  }

  /**
   * The level-selection screen. All three levels are listed and all three are startable
   * — nothing is gated behind finishing another one.
   *
   * The demo notice is rendered only when the pack carries one. That is the difference
   * between the two packs in this repository, whose people and memories are invented,
   * and a caregiver pack describing somebody real: the label belongs to the content, so
   * it comes from the file rather than being painted on by the engine.
   */
  showLevelSelect(view: LevelSelectView): void {
    this.overlayCard.classList.remove('wide', 'summary')
    this.overlayCard.classList.add('levels')
    this.overlayCard.innerHTML =
      `<h1>${escapeText(view.title)}</h1>` +
      `<p>${escapeText(view.subtitle)}</p>` +
      `<div class="levelList">${view.levels
        .map(
          (level, i) =>
            `<div><span>` +
            `<span class="ord">${level.ordinal}` +
            (level.finished ? ` <span class="done">· finished</span>` : '') +
            `</span>` +
            `<span class="name">${escapeText(level.title)}</span>` +
            (level.description ? `<span class="desc">${escapeText(level.description)}</span>` : '') +
            `<span class="shape">${level.shape}</span>` +
            `</span>` +
            `<button data-level="${i}">${level.finished ? 'Play again' : 'Start'}</button></div>`
        )
        .join('')}</div>` +
      (view.demoNotice ? `<div class="demo">${escapeText(view.demoNotice)}</div>` : '') +
      (view.keys ? `<div class="keys">${view.keys}</div>` : '')

    if (view.onPersonalise) {
      const button = document.createElement('button')
      button.textContent = view.personalisationLabel ?? 'Personalise Home'
      button.onclick = e => { e.stopPropagation(); view.onPersonalise?.() }
      this.overlayCard.append(button)
    }
    if (view.onCaregiverSetup) {
      const button = document.createElement('button')
      button.className = 'caregiverSetup'
      button.textContent = view.caregiverSetupLabel ?? 'Build from Photographs'
      button.onclick = e => { e.stopPropagation(); view.onCaregiverSetup?.() }
      this.overlayCard.append(button)
    }
    if (view.storageWarning) {
      const warning = document.createElement('p'); warning.setAttribute('role', 'alert')
      warning.textContent = view.storageWarning; this.overlayCard.append(warning)
    }
    for (const button of this.overlayCard.querySelectorAll<HTMLButtonElement>('button[data-level]')) {
      button.addEventListener('click', (e) => {
        e.stopPropagation()
        view.levels[Number(button.dataset.level)]?.onStart()
      })
    }
    this.overlayEl.hidden = false
  }

  /**
   * §4.4's summary. The rules it has to obey are all negative ones, so they are worth
   * stating where the markup is:
   *
   * - **All four outcomes, separately, always.** §4.3 — "there is no single score", so
   *   nothing here adds them up, ranks them, or colours one of them green.
   * - **`answerLatency` shows an em dash on a revealed or skipped step**, with the reason
   *   written out. A blank would read as zero; a number would let a fast reveal pass for
   *   a fast correct answer, which is the exact confusion §4.4 forbids.
   * - **`timeToReveal` is its own row**, never folded into latency.
   * - **The not-diagnostic label is on screen**, not only in the exported file.
   */
  showSummary(view: SummaryView): void {
    this.overlayCard.classList.remove('wide', 'levels')
    this.overlayCard.classList.add('summary')

    const ms = (value: number | null): string =>
      value === null ? '—' : `${(value / 1000).toFixed(1)}s`

    this.overlayCard.innerHTML =
      `<h1>${escapeText(view.title)}</h1>` +
      `<p>${escapeText(view.subtitle)}</p>` +
      `<div class="outcomeGrid">${view.outcomes
        .map((o) => `<div><b>${o.count}</b><span>${o.label}</span></div>`)
        .join('')}</div>` +
      `<div class="measures">${view.measures
        .map(
          (m) =>
            `<div><b>${m.value}</b><span>${m.label}` +
            (m.note ? ` <em>· ${m.note}</em>` : '') +
            `</span></div>`
        )
        .join('')}</div>` +
      `<div class="stepTable">${view.steps
        .map(
          (s) =>
            `<div><span>${s.label}</span><span class="n">${ms(s.durationMs)}</span>` +
            `<span class="o">${s.outcome}</span></div>`
        )
        .join('')}</div>` +
      `<div class="notdx">${view.notDiagnostic}</div>` +
      `<div class="actions">` +
      `<button class="primary" data-act="export">Download JSON</button>` +
      `<button data-act="replay">Replay</button>` +
      `<button data-act="levels">Level selection</button>` +
      // Absent rather than disabled on the last level: a greyed button that never does
      // anything is a thing to puzzle over, and this screen is read by tired people.
      (view.onNext ? `<button data-act="next">${view.nextLabel ?? 'Next level'}</button>` : '') +
      `</div>` +
      (view.keys ? `<div class="keys">${view.keys}</div>` : '')

    const on = (act: string, handler: (() => void) | null | undefined): void => {
      const button = this.overlayCard.querySelector<HTMLButtonElement>(`button[data-act="${act}"]`)
      if (!button || !handler) return
      button.addEventListener('click', (e) => {
        e.stopPropagation()
        handler()
      })
    }
    on('export', view.onExport)
    on('replay', view.onReplay)
    on('levels', view.onLevels)
    on('next', view.onNext)

    this.overlayEl.hidden = false
  }

  /**
   * §4.2 — a pack that cannot be run, with **every** problem listed at once. Warnings
   * are shown alongside the rejections deliberately: a caregiver fixing the file wants
   * one list, not one reload per fault.
   */
  showRejection(title: string, subtitle: string, problems: RenderedProblem[], keys?: string): void {
    this.overlayCard.classList.remove('summary', 'levels')
    this.overlayCard.classList.add('wide')
    this.overlayCard.innerHTML =
      `<h1>${title}</h1><p>${subtitle}</p>` +
      `<ul class="problems">${problems
        .map(
          (p) =>
            `<li class="${p.severity}"><span class="sev">${p.severity}</span>` +
            `<span class="where">${p.where}</span>${p.message}</li>`
        )
        .join('')}</ul>` +
      (keys ? `<div class="keys">${keys}</div>` : '')
    this.overlayEl.hidden = false
  }

  hideOverlay(): void {
    this.overlayEl.hidden = true
    this.overlayCard.classList.remove('wide', 'summary', 'levels')
  }

  get overlayVisible(): boolean {
    return !this.overlayEl.hidden
  }

  // --- Crosshair prompt --------------------------------------------------------

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

  // --- Mission banner ----------------------------------------------------------

  /**
   * `levelLabel` and `stepLabel` are both positional context — "Level 2 of 3 · Morning
   * walk", "Step 3 of 6" — never a score. The level line stays on screen for the whole
   * attempt so the player and whoever is sitting with them can always see which level
   * is running as well as what it is asking for.
   */
  showInstruction(levelLabel: string, stepLabel: string, instruction: string): void {
    this.instructionEl.innerHTML =
      `<span class="level">${escapeText(levelLabel)}</span>` +
      `<span class="step">${escapeText(stepLabel)}</span>${escapeText(instruction)}`
    this.missionEl.hidden = false
  }

  hideInstruction(): void {
    this.missionEl.hidden = true
  }

  /** One hint line at a time; it replaces the previous level rather than stacking. */
  setHint(text: string | null): void {
    this.hintText = text
    this.hintEl.textContent = text ?? ''
    this.hintEl.hidden = text === null
    if (this.card) this.renderCard()
  }

  setControls(html: string | null): void {
    // Called every frame from the loop; only touch the DOM when it actually changes.
    if (html === this.controlsHtml) return
    this.controlsHtml = html
    this.controlsEl.innerHTML = html ?? ''
    this.controlsEl.hidden = html === null
  }

  // --- Answer card -------------------------------------------------------------

  /**
   * §5.1: the pointer is already unlocked by the time this is called — releasing it is
   * what `expectingUnlock` exists to keep from being read as a pause.
   */
  showAnswerCard(options: AnswerCardOptions): void {
    this.photoFailed = false
    this.card = options
    this.missionEl.hidden = true
    this.answerEl.hidden = false
    this.renderCard()
  }

  /** Re-render with a changed choice list (level 2) or a revealed answer (level 3). */
  updateAnswerCard(patch: Partial<AnswerCardOptions>): void {
    if (!this.card) return
    this.card = { ...this.card, ...patch }
    this.renderCard()
  }

  hideAnswerCard(): void {
    this.card = null
    this.answerEl.hidden = true
  }

  get answerCardVisible(): boolean {
    return !this.answerEl.hidden
  }

  private photoFailed = false

  private renderCard(): void {
    const card = this.card
    if (!card) return
    const revealed = card.revealedId ?? null
    const sheet = this.answerEl.querySelector('.sheet')!

    // §4.2's no-mixing rule, enforced where the markup is written rather than trusted
    // from the caller: photos appear only if *every* choice on screen has one. A single
    // text card among photographs would point straight at the answer.
    const photos = !this.photoFailed && card.choices.every((c) => !!c.photoUrl)

    sheet.innerHTML =
      `<h2>${escapeText(card.question)}</h2>` +
      (card.memory ? `<figure>${card.memory.photo && !this.photoFailed ? `<img class="memory-photo" src="${escapeText(card.memory.photo)}" alt="Caregiver-selected memory" style="max-width:240px;max-height:160px;object-fit:contain">` : ''}<figcaption>${escapeText(card.memory.caption)}</figcaption></figure>` : '') +
      `<div class="choices">${card.choices
        .map(
          (c) =>
            `<button class="choice${photos ? ' photo' : ''}${c.id === revealed ? ' revealed' : ''}"` +
            ` data-id="${c.id}">` +
            (photos ? `<img class="portrait" src="${c.photoUrl}" alt="" draggable="false">` : '') +
            `<span class="name">${escapeText(c.name)}</span>` +
            (c.relationship ? `<span class="rel">${escapeText(c.relationship)}</span>` : '') +
            (c.hasVoice ? `<span class="voice">Tap to hear them</span>` : '') +
            `<span class="tag">The answer</span></button>`
        )
        .join('')}</div>` +
      `<p class="note">${escapeText(this.hintText ?? card.note ?? '')}</p>` +
      `<div class="actions">` +
      (revealed && card.onContinue ? `<button class="primary" data-act="continue">Continue</button>` : '') +
      `<button data-act="skip">Skip this step</button>` +
      `</div>`

    for (const img of sheet.querySelectorAll<HTMLImageElement>('img.portrait, img.memory-photo')) {
      img.onerror = () => { if (this.card === card) { this.photoFailed = true; this.renderCard() } }
    }
    for (const el of sheet.querySelectorAll<HTMLButtonElement>('button.choice')) {
      el.addEventListener('click', () => card.onSelect(el.dataset.id!))
    }
    sheet
      .querySelector<HTMLButtonElement>('button[data-act="skip"]')!
      .addEventListener('click', () => card.onSkip())
    sheet
      .querySelector<HTMLButtonElement>('button[data-act="continue"]')
      ?.addEventListener('click', () => card.onContinue?.())
  }

  // --- Event log ---------------------------------------------------------------

  /** Checkpoint A's "E logs an event"; Checkpoint B points the telemetry hooks at it. */
  log(message: string): void {
    const line = document.createElement('div')
    line.textContent = message
    this.logEl.appendChild(line)
    while (this.logEl.childElementCount > 5) this.logEl.removeChild(this.logEl.firstElementChild!)
    setTimeout(() => line.remove(), 6000)
  }

  clearLog(): void {
    this.logEl.replaceChildren()
  }
}
