# Smriti 3D

First-person cognitive-care prototype (SIH26003). SPEC.md §6 rows A–D are done: scaffold,
renderer, procedural world, movement and interaction (A); the mission runner, hint ladder,
answer card, skip, restart and telemetry hooks (B); real caregiver packs with validation,
media and injection (C); and telemetry recording, aggregation, the summary card, JSON
export and the offline check (D).

Row E adds the three levels (SPEC.md §4.5): a level-selection screen, per-level attempts
with their own event log and export, and two recall choice formats.

## The house

Five rooms around a central hallway — `hallway`, `livingRoom`, `kitchen`, `bedroom`,
`bathroom` — inside a fenced garden with a path and porch. You start outside, open the
front door with **E**, and walk in. The kitchen, bedroom and bathroom doors open the same
way; the living room is reached through an open arch, and a second arch connects it
directly to the kitchen.

## The three levels (SPEC.md §4.5)

Choose one from the level-selection screen; all three are always available.

| # | Level | What you do |
| --- | --- | --- |
| 1 | **A glass of water** | Walk to the kitchen, find the water jug, answer one question with family photographs |
| 2 | **Morning walk** | Living room → the radio · kitchen → the water jug · back to the living room → the framed photograph |
| 3 | **Familiar memories** | Find the framed photograph, then answer who is in it and what the day was |

Finding something means walking up to it and pressing **E** to look at it. Nothing is
carried, poured or switched on, and no instruction says otherwise.

While you play, the banner names the level and the step. When a level finishes, its summary
offers **Download JSON**, **Replay**, **Level selection**, and **Next level** where there is
one; the result stays on screen until you choose another attempt.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview    # serve dist/ on http://localhost:4173
npm run check      # headless checks: pack validation, hint ladder, aggregation, levels
npm run check:offline   # after a build: drives all three levels with the network off
```

## Controls

| Key | Action |
| --- | --- |
| Click | Lock the pointer and start |
| W A S D / arrows | Walk |
| Mouse | Look |
| E | Open or close the focused door, or interact with the focused object (logs an event) |
| Esc | Pause — stops the clock, from both `exploring` and `answering` (SPEC.md §5.1) |
| K | Skip the current step (always available, SPEC.md §5.4) |
| R | Replay the selected level — position, yaw, timers, hints, held keys and the event log (SPEC.md §5.6) |
| L | Back to the level-selection screen |
| J | Download the attempt as JSON, at any point (SPEC.md §4.4) |

## Telemetry (SPEC.md §4.4)

Events are recorded on the paused-time-removed clock, so every duration in the summary
already excludes time spent paused — there is no subtraction step because paused time was
never added. Finishing the mission shows the summary card: the four §4.3 outcomes counted
**separately** (there is no single score), completion time, hints used, highest hint level,
rooms visited, answer latency and time to reveal as two distinct rows, and the label
**"auxiliary interaction measures — not diagnostic"** on screen. `answerLatency` shows an
em dash, not a number, on a step that ended `revealed` or `skipped`.

With more than one question in a level, the two latency rows are means and the card says
how many questions went into each. The per-question values are never replaced by the mean:
they are in `summary.steps[]` in the export.

**Download JSON** on that card — or `J` at any moment — writes
`smriti-<patient>-<level>-<timestamp>.json` containing the level (id, index, title), the
attempt id and number, the pack id, the summary, per-step measures, dwell totals and the
full event log, with the not-diagnostic label repeated inside the file.

**One file describes one attempt at one level.** Starting any attempt empties the log
first, so a switch or a replay can never blend two together; the file writes out
`session.missionIdsInLog` so you can check rather than trust.

## Checks (SPEC.md §8)

```bash
npm run check           # ~440 assertions, headless, no browser
npm run build && npm run check:offline   # ~90 assertions in a real browser, network off
```

`npm run check` typechecks `tools/checks/*.check.ts` against `src/` and then runs each
under node with esbuild. It covers §4.2 validation in both choice formats, the hint ladder,
§4.4 aggregation, repeated room visits, multiple recall steps per level, and level
switching. `npm run check -- pack` runs one suite.

## Offline check (SPEC.md §1.1, §6 row D)

```bash
npm run build
npm run check:offline
```

`check:offline` starts the vendored static server (`vite preview` — no download needed),
launches headless Chrome with **every DNS name except localhost mapped to NOTFOUND**, and
then plays **all three levels** through to their summaries and exports. It prints every
request the page made and asserts that each same-origin asset resolved and that no remote
request succeeded. It also runs the reachability probe (SPEC.md §1): for each find target it
walks the standable floor, aims from each spot and runs the real interaction raycast, and
reports the nearest spot from which a player can actually focus it.

Add `--online` to run the same checks with the network available, or `--perf`
to also wait for §7's 300-frame sample (about a minute; headless is a software rasteriser,
so that figure is not the demo machine's).

## Memory packs (SPEC.md §4.1, §4.2)

Two fictional demo patients ship in `public/packs/`, selected with `?patient=`:

| URL | Patient | People | Level 1's question |
| --- | --- | --- | --- |
| `/` or `?patient=mira` | Mira | Ananya, Bina, Rupa | "Who visited you at Bihu in 2019?" |
| `?patient=raju` | Raju | Manoj, Sarita, Iqbal | "Who took you out on the boat at Chilika every winter?" |

Switching packs changes the framed photographs on the living-room wall and the bedside
table, the faces and names on the answer cards, the voice each card plays, all three
levels' wording and questions, and the patient's name.

**Both packs are fictional demonstration data and say so on screen.** Each declares a
`demo` block, which the level-selection screen renders verbatim: the patients, the people,
the photographs, the voices and every memory in them are invented. A caregiver pack
describing a real patient simply omits the block, and nothing is labelled. Real patient
content must always come from a caregiver-provided pack — the engine invents nothing
(SPEC.md §2).

**The media is generated, not collected.** `tools/make-media.sh` builds every JPEG and
MP3 in `public/packs/` from `tools/make-photos.py` (flat illustrated portraits and
abstract scenes — no real person is depicted) and macOS `say` (six distinct voices, so
switching packs is audibly different). The output is committed, so a clone needs neither
the script nor macOS. Re-run it only after editing the generator.

`?patient=broken` loads a deliberately invalid pack and shows every §4.2 problem in one
list. `?break=photo:ananya,voice:bina,anchor:livingRoomWall` points the named files at
paths that do not exist, so the three degradation rows in §4.2 can be seen without
deleting anything from disk.

## Version pin (SPEC.md §0)

`three` is pinned to exactly `0.181.2`, so the current API names apply: `HDRLoader`
(renamed from `RGBELoader` in r179) and `PCFShadowMap` (soft shadows moved here in r181;
`PCFSoftShadowMap` is deprecated for `WebGLRenderer`). No `^` on the pin.

## Degradation (SPEC.md §1.1)

Every network asset is optional. Textures (Poly Haven, 1k JPG) and the HDRI are fetched
with timeouts; on any failure the scene falls back to flat `MeshStandardMaterial`s and
`scene.environment = null`, with the hemisphere + directional pair carrying the room.
Verified with all non-localhost requests blocked — see the report in the checkpoint notes.

## Debug handle

`window.__smriti` exposes `{ world, player, interaction, state, renderer, ui, runner,
level, levels, telemetry, recorder, pack, media, voices, warnings, patientId }` for manual
verification without pointer lock, plus `summary()`, `exportJson()` and `debug`:

- `__smriti.debug.probeTargets()` — can a player stand somewhere and focus each of the
  three find targets? Walks the standable floor, aims from each spot and runs the real
  interaction raycast, reporting the nearest spot that works. `canFocus('radio')` does one.
- `__smriti.debug.startLevel(1)` — start level 2. `debug.restart()` replays the selected
  level; `debug.showLevels()` returns to the list.
- `__smriti.debug.restartInRoom('kitchen')` — starts a level with the player already
  standing in the kitchen, which is how §5.5's containment branch is exercised directly.
- `__smriti.debug.playVoice('ananya')` — plays one pack voice from the `audioSource`
  anchor on demand.
- `__smriti.debug.showSummary()` / `__smriti.debug.download()` — the summary card and the
  JSON file without finishing a level first.

`window.__smritiPerf` holds the §7 measurement once 300 frames have been sampled;
`window.__smritiAssets` records which downloads succeeded.

## Deployment

Not yet deployed — no Vercel or Netlify credentials are available in this environment.
See `DEPLOY.md` for the exact commands.

## Agent-assisted caregiver setup — Checkpoint F (SPEC.md §10)

An optional, setup-time authoring assistant that turns a caregiver's uploads and typed
notes into proposed pack content, which a caregiver must review and commit by hand before
anything reaches a patient session.

**What it does.** Reads a caregiver's uploads and typed notes through a small, fixed set
of read tools (`list_rooms`, `list_anchors`, `get_caregiver_text`, …), and proposes pack
content — a photo placement, a person, a navigate/find/recall step, a level — through an
equally fixed set of proposal tools. Every proposal is checked by a pure content firewall
before the caregiver ever sees it, and checked again the moment they try to commit it.

**What it is forbidden from doing.**
- **No model call ever occurs while a patient session is running.** The agent is a
  setup-time authoring assistant only; a patient session is byte-for-byte deterministic
  given the same pack, exactly as before this checkpoint existed.
- **The agent cannot commit its own proposals.** `commitProposal` / `rejectProposal` are
  UI-only actions, reachable only from a caregiver's own click — they are absent from the
  JSON schema handed to any model, so there is no path, direct or indirect, from a tool
  call to a change a patient will see.
- **The agent cannot introduce a fact.** It may describe an image's *visual* properties
  (orientation, brightness, whether it suits a portrait vs. a wall anchor) but never an
  *autobiographical* one (who someone is, when or where a photo was taken, what it
  depicts) — see SPEC.md §10.4. Any attempt to smuggle an invented name, date, place, or
  hedge ("probably your daughter") past the caregiver is rejected by the firewall, not by
  asking the model nicely.

**The firewall's role.** `src/agent/firewall.ts`'s `validateProposal()` is a pure,
synchronous function — no network, no model, no side effects — checked against rules
F-a through F-i (unmentioned people, invented dates/places, broken answer/choice
membership, ids the world doesn't have, a mismatched photo/anchor pairing, hedged or
clinical language). A rejection is shown to the caregiver with the exact rule id and the
offending token, never silently dropped. A prompt-injection attempt — rendered text in an
uploaded photo trying to add unrelated content — is caught the same structural way: the
injected text is simply not in the caregiver's own allow-list, so F-a rejects it.

**Consent and privacy.** The first real provider call is gated behind a one-time consent
dialog (§10.6) naming exactly what is sent (a downscaled, EXIF-stripped "probe" copy of
each photo) and what never is (original files, audio, telemetry). Declining leaves the
app at exactly the behaviour it had before Checkpoint F existed. EXIF — GPS above all —
is stripped before any derivative is produced (`src/agent/images.ts`): every derivative
is a fresh canvas re-encode, never the uploaded bytes. `agent-audit.jsonl` (git-ignored)
records that a call happened — timestamp, tool, asset id, byte count, model id, outcome —
and is structurally incapable of holding image content or caregiver text, because its
`AuditEntry` type has no field wide enough to carry either.

**The deployed build ships with `agent.enabled: false`.** This is the default in
`src/agent/config.ts`, and nothing under `src/agent/` is imported from `main.ts` — the
production bundle's module count is identical with or without this directory present.
See DEPLOY.md's "The agent layer ships fully inert" section for how that is verified.

<details>
<summary>What's built, checkpoint by checkpoint</summary>

- **F1 — tool layer and firewall, no provider.** `src/agent/tools.ts` (the §10.2 tool
  contracts and JSON schema — `commitProposal`/`rejectProposal` absent by construction),
  `src/agent/tokens.ts` (the caregiver-only allow-list builder), `src/agent/firewall.ts`
  (`validateProposal()`, rules F-a–F-i), `src/agent/stubModel.ts` (a scripted fake model
  for offline testing), and 27 adversarial fixtures in `src/agent/__fixtures__/`.
- **F2 — provider, image pipeline, consent.** `src/agent/images.ts` (EXIF/GPS strip,
  MIME/size validation, probe/texture/thumb derivatives — only `probe` is ever eligible
  to leave the machine), `src/agent/provider.ts` (a single Anthropic adapter behind the
  `ProviderAdapter` interface — timeout, retry-once, typed failure results for no-key,
  bad-key, timeout, malformed response and rate-limiting), `src/agent/config.ts` (the
  `AgentConfig` shape and the §10.6 consent gate), `src/agent/audit.ts`
  (`agent-audit.jsonl` logging), and `src/agent/selectProvider.ts` (chooses stub vs. real
  provider from config — stub stays the default in every test).
- **F3 — caregiver review and commit.** `src/agent/review.ts` (`ReviewSession`: firewall
  on arrival, `request_caregiver_input` answers widen the allow-list and re-validate,
  `edit()` and `commit()` re-run the firewall independently — a proposal can only reach
  "accepted"/"edited" status through a passing check at commit time), `src/agent/
  commitPack.ts` (folds committed proposals into a draft pack using the **existing**
  §4.1 schema — proven, in `npm run check`, to load through `MemoryPack.ts`'s unmodified
  §4.2 validator), and `src/agent/setupUI.ts` (the review list, crop-drag handles, and
  the consent dialog — plain DOM, not yet wired to an entry point in `main.ts`).
- **F4 — provenance, docs, checks.** `src/agent/provenance.ts` computes the §10.8 block
  (`accepted`/`edited`/`rejected`/`firewallRejected`/`caregiverInputRequests`) straight
  from `ReviewSession` state; it's an optional field on `MemoryPack` and on `Telemetry.ts`'s
  `ExportContext`/`ExportDocument` (type-only imports, erased at build time — zero
  runtime coupling), so an agent-assisted pack's session export carries it and a
  hand-authored pack's export is untouched. `npm run check` covers all of it — the
  firewall and token builder explicitly re-checked under `DEFAULT_AGENT_CONFIG`
  (`enabled: false`) to prove they don't change behaviour based on it.

None of F1–F4 touches the patient play path or the §9 editor, and `agent.enabled` stays
`false` throughout — this whole layer is present in the repository and fully inert.

</details>
