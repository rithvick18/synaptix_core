# Memoria 3D

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

On first load the app asks **where the model that builds your home's appearance should
run** — offline, on this computer via llama.cpp, or online via Google's
`gemini-3.5-flash-lite`. The answer is remembered and can be changed from the **Setup**
button on the level screen. Playing a level never uses a model in either case, so
"Decide later" leaves the game fully playable. See
[Agent-assisted caregiver setup](#agent-assisted-caregiver-setup--checkpoint-f-specmd-10).

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
`memoria-<patient>-<level>-<timestamp>.json` containing the level (id, index, title), the
attempt id and number, the pack id, the summary, per-step measures, dwell totals and the
full event log, with the not-diagnostic label repeated inside the file.

**One file describes one attempt at one level.** Starting any attempt empties the log
first, so a switch or a replay can never blend two together; the file writes out
`session.missionIdsInLog` so you can check rather than trust.

## Checks (SPEC.md §8)

```bash
npm run check           # 993 assertions across 9 counted suites, headless, no browser
npm run build && npm run check:offline   # ~90 assertions in a real browser, network off
```

`npm run check` typechecks `tools/checks/*.check.ts` against `src/` and then runs each
under node with esbuild. It covers §4.2 validation in both choice formats, the hint ladder,
§4.4 aggregation, repeated room visits, multiple recall steps per level, and level
switching. Both provider adapters are exercised against an injected fake `fetch`, so the
offline adapter's loopback refusal and the online adapter's one-destination and no-key
refusals are proved without a model server, an API key or a socket:
`npm run check -- gemini` runs that suite, and `npm run check -- pack` any other.

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

## Resolution (SPEC.md §1.1, §7)

How sharp the house looks is three separate things, and each is now decided by what the
machine can show rather than pinned to the cheapest value that could never hurt anyone.

| | Before | Now |
| --- | --- | --- |
| Poly Haven maps | 1k, always | 1k at boot, upgraded to 2k in the background |
| Anisotropy | 4, hard-coded | the hardware maximum, typically 16 |
| Pixel ratio | 1, pinned | climbs a ladder to at most 2, by measurement |
| Procedural floor pattern | 256 px | 1024 px, mipmapped |

**Nothing costs boot time.** Every tier still boots on 1k maps, because the loading
screen is the one place the extra bytes would actually be felt. The 2k set is fetched
afterwards, one set at a time, and swapped onto the live materials. It is not four times
the frame cost — the draw calls, shaders and triangles are identical and a mip chain
means roughly the same texels are sampled either way — it is four times the *download*,
which is why it is paid off the critical path. A failed or slow upgrade leaves the house
in the 1k maps it is already wearing (§1.1), exactly as a failed download always has.

**Nothing is raised on a machine that has not demonstrated it can afford it.** The pixel
ratio starts at 1 and climbs one rung at a time while the frame deadline is met, freezes
one rung below where it is missed, and keeps watching afterwards so it can give back a
rung that turns out not to hold. It never climbs twice, so it can correct but not
oscillate. A machine with no headroom is left at exactly the settings that shipped
before any of this existed — as is a software rasteriser, which is what
`check:offline` runs on, so its §7 figure stays comparable with every earlier run.

`?quality=software|baseline|full` forces a tier, for testing a path your machine would
not choose, or for a GPU that is read wrongly. It can ask for a tier but never for
anisotropy the driver lacks or a ratio above the display's own. The on-screen readout
(bottom right) shows the settled ratio, the map size and the anisotropy in use, and
`window.__memoriaAssets` carries the tier, the reason for it, the ladder and every step
it took.

The HDRI is deliberately still 1k: it is never sampled directly, only prefiltered by
`PMREMGenerator` into a fixed-size mip chain, so a 2k source would be four times the
download for a difference confined to the sharpest reflections in a house made of
plaster, laminate and fabric.

## Degradation (SPEC.md §1.1)

Every network asset is optional. Textures (Poly Haven, 1k JPG) and the HDRI are fetched
with timeouts; on any failure the scene falls back to flat `MeshStandardMaterial`s and
`scene.environment = null`, with the hemisphere + directional pair carrying the room.
Verified with all non-localhost requests blocked — see the report in the checkpoint notes.

## Debug handle

`window.__memoria` exposes `{ world, player, interaction, state, renderer, ui, runner,
level, levels, telemetry, recorder, pack, media, voices, warnings, patientId }` for manual
verification without pointer lock, plus `summary()`, `exportJson()` and `debug`:

- `__memoria.debug.probeTargets()` — can a player stand somewhere and focus each of the
  three find targets? Walks the standable floor, aims from each spot and runs the real
  interaction raycast, reporting the nearest spot that works. `canFocus('radio')` does one.
- `__memoria.debug.startLevel(1)` — start level 2. `debug.restart()` replays the selected
  level; `debug.showLevels()` returns to the list.
- `__memoria.debug.restartInRoom('kitchen')` — starts a level with the player already
  standing in the kitchen, which is how §5.5's containment branch is exercised directly.
- `__memoria.debug.playVoice('ananya')` — plays one pack voice from the `audioSource`
  anchor on demand.
- `__memoria.debug.showSummary()` / `__memoria.debug.download()` — the summary card and the
  JSON file without finishing a level first.

`window.__memoriaPerf` holds the §7 measurement once 300 frames have been sampled;
`window.__memoriaAssets` records which downloads succeeded.

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

**The prompts, and why they are shaped like a form.** Every prompt the model sees lives in
`src/agent/prompts.ts` under one version (`f-2`), which is the version a pack's provenance
block records. Both jobs here — authoring content, and designing the room environment —
fail the same way: by answering too early. A model names the face in the photograph before
asking itself whether anyone supplied a name; it picks a hex colour before noticing the
room is lit by a tungsten bulb. So neither prompt asks for an answer. Each asks for a short
named note per reasoning step — what the caregiver supplied, what is visible, what is
missing, the plan and its ids, a self-check against the rejection rules — and only then for
tool calls.

Offline, that ordering is not a request. `llamaCpp.ts` compiles the same step list into the
decoding schema as required fields declared *ahead* of `calls`, and JSON properties are
emitted in schema order under a grammar, so the sampler has no path to a tool call that
skips the reasoning. Online, Gemini owns the response shape, so the identical steps go into
the system instruction as the order to think in — an instruction, not a constraint, and the
code says so rather than claiming otherwise. The prose and the schema are rendered from one
array, so they cannot drift apart.

The rest of each prompt is mostly *context*, not exhortation. There is no read/propose loop
— small models fall apart in one — so the read tools are resolved up front and their answers
inlined: every room, interactable, anchor, upload and highlight target the model may name,
plus the caregiver's own allow-list, the one the firewall is about to judge the output
against. Telling a 4B model the twelve ids it may use beats any amount of prose about
choosing ids carefully. The prompt also states the firewall's rules, which changes nothing
about what is enforced — §10.3 runs afterwards and wins — but a proposal the firewall
rejects is one the caregiver has to repair by hand, so it is worth real accuracy.

**Two setup modes, chosen at start.** The first thing the app asks is where the model
runs. The screen is `src/agent/setupModeUI.ts`; the answer is one field, `setupMode`, and
nothing else in the app branches on it.

| | **Offline setup** | **Online setup** |
| --- | --- | --- |
| Model | a 4-bit quantised ~4B vision model | `gemini-3.5-flash-lite` |
| Runtime | llama.cpp's `llama-server` over loopback | Google's Gemini Interactions API |
| Adapter | `src/agent/llamaCpp.ts` | `src/agent/gemini.ts` |
| Needs | the server running on this machine | a Gemini API key |
| Photographs | never leave the device | downscaled probe copies cross the internet |

Offline mode is the difference between a privacy policy and a privacy property: patient
photographs never leaving the device is not a promise about a third party's conduct, it
is a fact about the network path. `LlamaCppProviderAdapter` refuses any `baseUrl` that
does not resolve to loopback, before opening a socket, and the endpoint is read from
`.env` only — never persisted to `localStorage` — so a tampered stored config cannot
express an off-machine address at all.

Online mode gives that property up, and says so on the setup screen rather than in a
footnote. What is left to enforce, and what `GeminiProviderAdapter` does enforce before
it opens a socket, is that there is exactly one destination — HTTPS to
`generativelanguage.googleapis.com`, every other host refused — and that nothing is sent
at all without a key, rather than uploading the images and finding out. The API key is
held in this browser and travels as the `x-goog-api-key` header; switching back to
offline clears it, so a machine returned to local inference carries no credential.

A small local model is weaker than a frontier hosted one and its proposals are rougher;
online mode is the trade in the other direction, buying accuracy and nothing to install
at the cost of the network path. Either way the design already assumes the model is
untrusted: every proposal passes the firewall and then a human before it can reach a
patient. Accuracy buys convenience, not correctness.

**Consent and privacy.** Each mode carries its own disclosure (§10.6), and the setup
screen renders it next to the button that chooses that mode — what reads the
photographs, what it is shown (a downscaled, EXIF-stripped "probe" copy) and what it
never is. Offline mode's is a disclosure that a model reads the photographs at all, not
consent to a transfer, and it still says nothing reaches the internet. Online mode's is a
transfer consent, and does not repeat a promise it cannot keep.

Consent never crosses a mode change: agreeing that a model on your own machine may look
at the photographs is not agreeing that Google may, so `applySetupMode` drops
`consentGiven` whenever the mode actually changes and the screen re-asks. Declining, in
either mode, leaves the app at exactly the behaviour it had before Checkpoint F existed. EXIF — GPS above all — is stripped before
any derivative is produced (`src/agent/images.ts`): every derivative is a fresh canvas
re-encode, never the uploaded bytes. `agent-audit.jsonl` (git-ignored) records that a
call happened — timestamp, tool, asset id, byte count, model id, outcome — and is
structurally incapable of holding image content or caregiver text, because its
`AuditEntry` type has no field wide enough to carry either.

**Tool calls are constrained, not requested.** A 4B model asked politely for JSON will
sometimes answer in prose, and Gemma-class chat templates carry no native tool-calling
support to fall back on. So `AGENT_TOOL_SCHEMA` is compiled into a single JSON schema —
an envelope whose `calls[]` items are a discriminated union over every tool, keyed by a
`const` name — and passed as `response_format: { type: 'json_schema' }`. llama.cpp turns
that into a GBNF grammar and enforces it during sampling, so the model *cannot* emit a
token sequence outside the schema: `tool` is always a real tool, `args` always matches
that tool's parameters, and `maxProposalsPerRun` is enforced by the sampler rather than
by trimming an over-long list afterwards. It guarantees shape, not truth — which is
still what the firewall is for.

Online mode cannot constrain a sampler it does not own, so it uses Gemini's own function
calling with `tool_choice.allowed_tools.mode: "any"`, which forces a call to one of the
declared tools. That is the weaker guarantee, so `gemini.ts` re-checks what arrives: a
tool name that was never declared is a `malformed-response`, and `maxProposalsPerRun` is
applied as a trim on arrival rather than a cap during sampling. Gemini's parameter schema
is an OpenAPI subset, so `AGENT_TOOL_SCHEMA` is projected onto the keywords it accepts
(`additionalProperties`, `pattern` and `const` are dropped) — which loosens what the
model is *asked* for and nothing that is *accepted*, because the firewall and
`validateEnvironment` still run on everything that comes back.

### Running the local model

```bash
llama-server -m models/gemma-3-4b/gemma-3-4b-it-Q4_K_M.gguf \
             --mmproj models/gemma-3-4b/mmproj-model-f16.gguf \
             --host 127.0.0.1 --port 8080 --ctx-size 8192 --parallel 1 \
             --alias local --cors-origins http://localhost:5173
```

`--mmproj` is the vision projector; without it the model cannot see the photographs, and
the adapter reports `model-not-loaded` with that flag named rather than failing opaquely.
Copy `.env.example` to `.env` to point at a different port. The room-environment
generator reads these settings when Generate is clicked; it does not depend on the older
pack-authoring assistant’s `agent.enabled` flag.

### Running the online model

Nothing to install. Choose **Online setup** on the start screen and paste a Gemini API
key (create one at <https://aistudio.google.com/apikey>); it is kept in this browser.
`.env.example` has `VITE_GEMINI_API_KEY` and `VITE_GEMINI_MODEL` for developers who would
rather not re-type it — but a `VITE_` variable is baked into the built bundle, so for
anything beyond your own machine leave it blank and use the setup screen. The model
defaults to `gemini-3.5-flash-lite`.

**The older pack-authoring assistant ships with `agent.enabled: false`.** This is the default in
`src/agent/config.ts`, and is separate from the active room-environment generator described below.


<details>
<summary>What's built, checkpoint by checkpoint</summary>

- **F1 — tool layer and firewall, no provider.** `src/agent/tools.ts` (the §10.2 tool
  contracts and JSON schema — `commitProposal`/`rejectProposal` absent by construction),
  `src/agent/tokens.ts` (the caregiver-only allow-list builder), `src/agent/firewall.ts`
  (`validateProposal()`, rules F-a–F-i), `src/agent/stubModel.ts` (a scripted fake model
  for offline testing), and 27 adversarial fixtures in `src/agent/__fixtures__/`.
- **F2 — local model, image pipeline, consent.** `src/agent/images.ts` (EXIF/GPS strip,
  MIME/size validation, probe/texture/thumb derivatives — only `probe` is ever shown to
  the model), `src/agent/provider.ts` (the `ProviderAdapter` seam — types only, no
  inference runtime, so nothing that depends on it pulls one in),
  `src/agent/llamaCpp.ts` (the only implementation: a local `llama-server` over loopback,
  grammar-constrained tool calls, timeout, retry-once for the two genuinely transient
  cases, and typed failures for `server-unreachable`, `model-not-loaded`, `overloaded`,
  `timeout` and `malformed-response`), `src/agent/config.ts` (the `AgentConfig` shape and
  the §10.6 consent gate), `src/agent/audit.ts` (`agent-audit.jsonl` logging), and
  `src/agent/selectProvider.ts` (chooses stub vs. local model from config — stub stays
  the default in every test).
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
- **F5 — the prompt layer.** `src/agent/prompts.ts` holds every prompt the LLM layer
  sends, under one version, along with the reasoning steps both adapters render (offline
  into the decoding schema, online into the system instruction) and the builder that
  inlines a run's resolved world context. `src/agent/authoring.ts` is the pack-authoring
  counterpart to `environment.ts`: one model call, proposal tools only, and typed
  proposals out — including a schema-driven argument check that turns a malformed hosted
  tool call into a reported skip rather than a throw inside the firewall.
  `tools/checks/agent-prompts.check.ts` pins the ordering property the whole design rests
  on — the reasoning fields are required and declared before `calls`, so they cannot be
  skipped — and proves a person proposed in a run can be a recall choice in the same run.

The pack-proposal review workflow remains inactive. The room-environment generator reuses the local vision provider and image pipeline directly from Personalise Home.

</details>

## Generate a home appearance from room photos

Open **Personalise Home**, select one to three room reference images, optionally add
visual preferences, and click **Generate environment from photos**. Review or edit the
colour swatches, then **Save and Play**. The vision model your setup mode selected reads
downscaled, metadata-free copies and produces a validated environment description. Wall paint,
floor colour and procedural wood/tile/carpet patterns, wood and upholstery colours,
accents, and indoor lighting change in the playable house. Settings persist in IndexedDB
and reload without inference. Reset environment restores the default appearance.

This is appearance matching within the existing house, not photogrammetry: floor plan,
furniture shapes and placement remain fixed. Which model reads the photographs is the
setup mode chosen at start, and the form says so above the button: offline needs a
running vision-capable llama-server with a matching projector (default
`http://127.0.0.1:8080`, overridable in `.env`), online needs a Gemini API key. No
inference runs until Generate is clicked, in either mode. Failure keeps the previous
environment and shows a retry/setup message. Reference uploads are held only for this
editor session; the generated style is saved. In offline mode, browser CORS/local-network
permissions must allow the app to reach llama-server.
