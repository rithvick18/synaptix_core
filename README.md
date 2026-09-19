# Smriti 3D

First-person cognitive-care prototype (SIH26003). SPEC.md §6 rows A–D are done: scaffold,
renderer, procedural world, movement and interaction (A); the mission runner, hint ladder,
answer card, skip, restart and telemetry hooks (B); real caregiver packs with validation,
media and injection (C); and telemetry recording, aggregation, the summary card, JSON
export and the offline check (D).

Mission 2 is the next thing, and SPEC.md §6 gates it behind D passing.

## The house

Five rooms around a central hallway — `hallway`, `livingRoom`, `kitchen`, `bedroom`,
`bathroom` — inside a fenced garden with a path and porch. You start outside, open the
front door with **E**, and walk in. The kitchen, bedroom and bathroom doors open the same
way; the living room is reached through an open arch, and a second arch connects it
directly to the kitchen.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview    # serve dist/ on http://localhost:4173
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
| R | Restart the mission — position, yaw, timers, hints and the event log (SPEC.md §5.6) |
| J | Download the session as JSON, at any point (SPEC.md §4.4) |

## Telemetry (SPEC.md §4.4)

Events are recorded on the paused-time-removed clock, so every duration in the summary
already excludes time spent paused — there is no subtraction step because paused time was
never added. Finishing the mission shows the summary card: the four §4.3 outcomes counted
**separately** (there is no single score), completion time, hints used, highest hint level,
rooms visited, answer latency and time to reveal as two distinct rows, and the label
**"auxiliary interaction measures — not diagnostic"** on screen. `answerLatency` shows an
em dash, not a number, on a step that ended `revealed` or `skipped`.

**Download JSON** on that card — or `J` at any moment — writes
`smriti-<patient>-<timestamp>.json` containing the summary, per-step measures, dwell totals
and the full event log, with the not-diagnostic label repeated inside the file.

## Offline check (SPEC.md §1.1, §6 row D)

```bash
npm run build
npm run check:offline
```

`check:offline` starts the vendored static server (`vite preview` — no download needed),
launches headless Chrome with **every DNS name except localhost mapped to NOTFOUND**, and
then plays the mission through to its summary and export. It prints every request the page
made and asserts that each same-origin asset resolved and that no remote request
succeeded. Add `--online` to run the same checks with the network available, or `--perf`
to also wait for §7's 300-frame sample (about a minute; headless is a software rasteriser,
so that figure is not the demo machine's).

## Memory packs (SPEC.md §4.1, §4.2)

Two fictional demo patients ship in `public/packs/`, selected with `?patient=`:

| URL | Patient | People | Recall question |
| --- | --- | --- | --- |
| `/` or `?patient=mira` | Mira | Ananya, Bina, Rupa | "Who visited you at Bihu in 2019?" |
| `?patient=raju` | Raju | Manoj, Sarita, Iqbal | "Who took you out on the boat at Chilika every winter?" |

Switching packs changes the framed photographs on the living-room wall and the bedside
table, the faces and names on the answer cards, the voice each card plays, the mission
wording and the patient's name.

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

`window.__smriti` exposes `{ world, player, interaction, state, renderer, ui, missions,
telemetry, recorder, pack, media, voices, warnings, patientId }` for manual verification
without pointer lock, plus `summary()`, `exportJson()` and `debug`:

- `__smriti.debug.restartInRoom('kitchen')` — restarts with the player standing in the
  kitchen, which is how §5.5's containment branch is exercised directly.
- `__smriti.debug.playVoice('ananya')` — plays one pack voice from the `audioSource`
  anchor on demand.
- `__smriti.debug.showSummary()` / `__smriti.debug.download()` — the summary card and the
  JSON file without finishing a mission first.

`window.__smritiPerf` holds the §7 measurement once 300 frames have been sampled;
`window.__smritiAssets` records which downloads succeeded.

## Deployment

Not yet deployed — no Vercel or Netlify credentials are available in this environment.
See `DEPLOY.md` for the exact commands.
