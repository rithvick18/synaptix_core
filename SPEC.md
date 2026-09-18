# Smriti 3D — Specification

The source of truth for this project. Every implementation request says "follow SPEC.md".
Update this file whenever a decision changes.

Build prompts live in `PROMPTS.md` and are deliberately not in this file — the coding tool
reads this one on every request and must not see instructions for checkpoints it is not
building yet.

---

## 0. Version pin

Pin an exact Three.js version in `package.json` — no `^`. Build against r179+ and use the
current API names:

| Use | Not | Since |
| --- | --- | --- |
| `HDRLoader` | `RGBELoader` (renamed) | r179 |
| `PCFShadowMap` | `PCFSoftShadowMap` (deprecated for `WebGLRenderer`; soft shadows now come from `PCFShadowMap`) | r181 |

If you pin below r179, use the old names consistently instead. Check the pinned version's
entry in the [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
before writing loader or shadow code — do not mix eras.

---

## 1. The world contract

The largest unresolved risk was "find a verified walkable interior." Rather than block on it,
**the world is defined by an interface, and the first implementation is procedural.**

```ts
interface WorldSource {
  root: THREE.Object3D
  blockers: THREE.Box3[]                          // solid — player cannot pass
  triggers: { room: string; box: THREE.Box3 }[]   // overlapping, fire on entry
  anchors: Record<string, THREE.Object3D>         // personalisation mount points
  interactables: Record<string, THREE.Object3D>   // id → object, e.g. 'water-jug'
  hintTargets: Record<string, THREE.Object3D>     // id → object, e.g. 'kitchenDoor'
  spawn: { position: THREE.Vector3; yaw: number }
  roomOf(point: THREE.Vector3): string | null     // containment test, not entry event
}
```

**Required IDs — every implementation must provide all of them.** Coordinates, geometry and
blockers may differ freely; the ids may not.

| Kind | Required ids |
| --- | --- |
| rooms | `livingRoom`, `kitchen` |
| interactables | `water-jug` |
| hintTargets | `kitchenDoor`, `water-jug` |
| anchors | `livingRoomWall`, `bedsideFrame`, `audioSource` |

A pack referencing an id absent from the active world is a load-time rejection (§5.2).

### 1.1 `proceduralHouse.ts` — the default, built first

Boxes and planes with Poly Haven PBR materials, two connected rooms, a passable doorway.
**Primitive-built scenery and props are explicitly permitted** — the "no custom modelling"
rule bans Blender work, not `BoxGeometry`. The jug may be a lathe or cylinder+torus
primitive; it needs to be recognisable, not beautiful.

**Degradation contract — the fallback must itself have a fallback:**

| If this fails | Then |
| --- | --- |
| HDRI download or decode | Hemisphere + directional light, `scene.environment = null`, still playable |
| PBR texture downloads | Plain `MeshStandardMaterial` with flat colours and sensible roughness |
| Any prop model | Primitive stand-in with the correct id and bounding size |

"Always works" means the scene renders and the mission completes with **zero network
assets present**. Verify that by loading with the network tab set to offline.

### 1.2 `glbHouse.ts` — deferred

Do not implement until the procedural loop is complete through Checkpoint B. Then, only if a
GLB passes this gate: loads without errors · metric scale (doorway ≈ 2 m) · two connected
rooms with a passable doorway · rooms enterable, not facades · materials survive load ·
< 40 MB and < 500k tris · **decoder check — Draco / Meshopt / KTX2 needed? wire the loader or
reject** · a flat wall usable for personalisation · measured frame time acceptable on the
demo machine.

Record in `ASSETS.md`: source URL, local filename, license, attribution text.

---

## 2. Project

**Smriti** — a first-person cognitive-care prototype for dementia support (SIH26003).
A patient walks through a familiar home and completes caregiver-defined memory tasks.

**Hard product rule:** the system never invents an autobiographical memory. Every question,
choice, answer and hint string comes from the caregiver pack. The engine selects and
displays only.

**Stack:** Three.js + TypeScript + Vite. No React, no R3F, no ECS, no physics engine,
no state library.

### Scope

**IN** — one `WorldSource` with two connected rooms · walk + look + interact + hint + pause +
skip + restart · fixed 1.6 m camera height, **no gravity** · separate blockers and triggers ·
raycast interaction with distance limit and occlusion check · state machine · one mission
(navigate → find → recall) · three hint levels + skip · two memory packs with distinct real
media · HDRI + PMREM + ACES · loading screen · telemetry, summary, JSON export · deployed

**OUT** — exterior world · openable doors · physics · NPCs · Blender modelling ·
KTX2/Draco *pipeline* · backend calls · localisation · CV/EEG · bloom · SSAO · `OutlinePass` ·
head bob · gravity · second mission until the core is stable

---

## 3. Architecture

```
src/
├── main.ts              entry, game loop
├── Renderer.ts          WebGLRenderer, HDRLoader + PMREM, ACES
├── State.ts             exploring | answering | paused | completed
├── Player.ts            controller, camera, collision
├── World.ts             WorldSource interface + active world
├── proceduralHouse.ts   default world (Checkpoint A)
├── glbHouse.ts          optional, deferred
├── layout.ts            blockers, triggers, anchors, ids
├── Interaction.ts       raycast, distance + occlusion, highlight, prompt
├── Missions.ts          step runner
├── Telemetry.ts         typed event hooks (B) + recording/export (D)
├── MemoryPack.ts        fetch, validate, inject (C)
└── ui.ts                HUD, hints, answer cards, loader, summary
```

---

## 4. Data contracts

### 4.1 Memory pack

```json
{
  "patient": { "name": "Mira" },
  "people": [
    { "id": "ananya", "name": "Ananya", "relationship": "Granddaughter",
      "photo": "/packs/mira/ananya.jpg", "voice": "/packs/mira/ananya.mp3" },
    { "id": "bina", "name": "Bina", "relationship": "Daughter",
      "photo": "/packs/mira/bina.jpg" },
    { "id": "rupa", "name": "Rupa", "relationship": "Neighbour",
      "photo": "/packs/mira/rupa.jpg" }
  ],
  "anchors": {
    "livingRoomWall": "/packs/mira/bihu.jpg",
    "bedsideFrame": "/packs/mira/ananya.jpg"
  },
  "missions": [{
    "id": "water",
    "title": "Go to the kitchen and find the water jug",
    "steps": [
      { "type": "navigate", "targetRoom": "kitchen",
        "instruction": "Please go to the kitchen.",
        "hints": { "repeat": "Please go to the kitchen.",
                   "highlight": "kitchenDoor",
                   "guide": "The kitchen is through this door." } },
      { "type": "find", "targetObject": "water-jug",
        "instruction": "Can you find the water jug?",
        "hints": { "repeat": "Can you find the water jug?",
                   "highlight": "water-jug",
                   "guide": "It is on the counter, here." } },
      { "type": "recall",
        "question": "Who visited you at Bihu in 2019?",
        "choices": ["ananya", "bina", "rupa"],
        "answer": "ananya",
        "reducedChoices": ["ananya", "rupa"],
        "hints": { "repeat": "Who visited you at Bihu in 2019?",
                   "highlight": "reduce",
                   "guide": "It was Ananya, your granddaughter." } }
    ]
  }]
}
```

**Checkpoint B ships one bundled fixture** at `src/fixtures/mission.fixture.json` using this
exact schema, imported directly. No fetch, no validation, no media. C replaces it with real
loading. B must not invent a different shape.

### 4.2 Pack validation — at load, reporting all problems at once

| Problem | Behaviour |
| --- | --- |
| Decorative anchor photo missing | Neutral placeholder texture, warn, continue |
| Voice/audio file missing | Silent, continue |
| `answer` not in `choices` | **Reject pack** |
| A `choices` id missing from `people` | **Reject pack** |
| `targetRoom` / `targetObject` / `highlight` id absent from the active world | **Reject pack** |
| **Any** recall photo fails to load | **Apply the same text-only card style to every choice in that question.** Never mix photo and text cards — the odd one out identifies the answer |
| All choice rendering fails | Skip the step, outcome `skipped` |
| `reducedChoices` missing the answer | Ignore `reducedChoices`, warn |

### 4.3 Completion outcomes — four values, never merged

```ts
type Outcome = 'independent' | 'cued' | 'revealed' | 'skipped'
```

- `independent` — correct, no hint shown
- `cued` — correct after hint level 1 or 2, **or after level-3 guidance where the player still
  performed the action themselves**
- `revealed` — the answer was given and the step ended without the player performing it
- `skipped` — player used skip

Revealed and skipped are never counted as correct. The summary reports all four separately;
there is no single score.

### 4.4 Telemetry

Define the typed hooks in **Checkpoint B** and call them from the mission runner as behaviour
is built. D implements recording, aggregation and export — it must not need to revisit
mission logic.

```ts
type Event =
  | { t: number; kind: 'mission_start' | 'mission_complete'; id: string }
  | { t: number; kind: 'step_start' | 'step_end'; step: number; type: string; outcome?: Outcome }
  | { t: number; kind: 'room_enter'; room: string }
  | { t: number; kind: 'object_dwell'; id: string; ms: number }
  | { t: number; kind: 'object_interact'; id: string; correct: boolean }
  | { t: number; kind: 'question_shown'; step: number }
  | { t: number; kind: 'answer_selected'; choice: string; correct: boolean }
  | { t: number; kind: 'hint_shown'; level: 1 | 2 | 3; step: number }
  | { t: number; kind: 'pause' | 'resume' | 'restart' }
```

Summary fields: `completionTime`, `hintsUsed`, `maxHintLevel`, `roomsVisited`,
`answerLatency`, `timeToReveal`, and a count per `Outcome`.

- **`answerLatency` is `null`** when the step ended `revealed` or `skipped`. Time from
  `question_shown` to the reveal is recorded separately as `timeToReveal`. Never fold them
  together — a fast reveal would otherwise look like a fast correct answer.
- **`routeEfficiency` is cut from v1.** It needs a defined reference route and formula; add it
  only when both exist.
- Log **dwell, not frames**: emit `object_dwell` only when the raycast target changes, and only
  past a 250 ms threshold.
- Pause stops all timers; subtract paused time from every duration.
- **Claim nothing clinical.** Label the summary "auxiliary interaction measures — not
  diagnostic" *on screen*. Compare only against the same patient's past sessions.

---

## 5. Behaviour rules

### 5.1 State machine and timers

`exploring | answering | paused | completed`

| State | Movement | Pointer lock | Hint + response timers |
| --- | --- | --- | --- |
| `exploring` | on | locked | **running** |
| `answering` | frozen | intentionally unlocked | **running** — recall hints must still fire |
| `paused` | frozen | unlocked | **stopped** |
| `completed` | frozen | unlocked | **stopped** |

The critical correction: entering `answering` must **not** pause timers. Freeze movement only.
If timers stopped there, recall hints could never fire and response time would never accrue.
Only `paused` and `completed` stop the clock.

**Intentional vs unexpected pointer-lock exit.** Showing an answer card releases the pointer
deliberately — that transition stays in `answering` and must not be treated as a pause. Track
an `expectingUnlock` flag set immediately before the release; the `pointerlockchange` handler
ignores one exit while it is set, and otherwise goes to `paused`. Resuming from a paused
answer screen returns to `answering` with the card visible and the pointer **still unlocked** —
re-lock only when returning to `exploring`.

### 5.2 Interaction

Raycast from screen centre against interactables; reject hits beyond 2.5 m; resolve the hit up
the parent chain to the tagged object.

**Occlusion against `Box3` blockers uses ray–box intersection, not `intersectObjects`.**
Blockers are bounding boxes, not scene meshes:

```ts
const hit = new THREE.Vector3()
for (const box of world.blockers) {
  if (raycaster.ray.intersectBox(box, hit)) {
    if (raycaster.ray.origin.distanceTo(hit) < targetDistance) return null  // occluded
  }
}
```

### 5.3 Highlight

Emissive or colour lift on the focused object only. Store original material values and restore
on focus change. If the object shares a material with others, **clone the material for the
highlighted object** so they don't all light up.

### 5.4 Hint ladder

Timers reset on progress. Level 3 behaviour **depends on step type**:

| Level | Delay | `navigate` / `find` | `recall` |
| --- | --- | --- | --- |
| 1 | ~20 s | Repeat instruction, shown and spoken | Same |
| 2 | ~45 s | Highlight the `hints.highlight` target | Swap to `reducedChoices` — always keeping the answer, removing a distractor deterministically, recording that assistance occurred |
| 3 | ~75 s | **Show guidance and wait.** The player must still walk there or interact. Completing after guidance is `cued`. Skip remains available | Reveal the answer; the step may end as `revealed` |

Level 3 must not auto-complete a navigate or find step — that would skip the gameplay the
metric is measuring. Skip is always available. Nothing ever shows "wrong", a red cross, a
countdown or a score.

### 5.5 Navigate steps use containment, not just entry events

When a `navigate` step begins, test `world.roomOf(player.position)` immediately. If the player
is already in `targetRoom`, complete the step at once. Relying only on a future `room_enter`
event hangs forever when the player is already there — which happens on every restart taken
in the kitchen.

### 5.6 Restart — part of Checkpoint B

Resets: player **position and yaw** to `spawn` · current room membership · all highlights and
the focused object · mission step index · every timer · hint levels · selected answers ·
pointer-lock state · audio playback · the telemetry event log. Then re-runs §5.5's containment
check. Verify pause, resume and restart before starting mission 2.

---

## 6. Checkpoints

| # | Deliverable | Done when |
| --- | --- | --- |
| A | Scaffold, renderer, procedural world, movement, one interaction, deploy | Walk between two rooms; look at the jug → prompt → E logs an event; occlusion verified through a wall; **frame time measured** (§7); deployed URL reachable, or the exact remaining manual step stated and deployment marked incomplete |
| B | Mission runner from fixture, three steps, hint ladder, answer UI, telemetry hooks, restart | A stranger completes the mission unaided; each hint level fires with correct per-type level-3 behaviour; skip works; restart fully resets including yaw; restarting *inside the kitchen* still completes step 1 |
| C | Real packs, validation, media, injection | `?patient=raju` changes photos, **audible voice** and name; a deliberately broken pack is rejected listing every problem at once; a missing recall photo renders all choices as text |
| D | Recording, aggregation, export, summary, offline, recording | Export has all four outcome counts, `answerLatency: null` on revealed steps, `timeToReveal` present; `dist/` runs with the network fully offline; 60 s screen recording exists |

Mission 2 only after D passes. It needs repeated-navigate steps, audio-cue steps and multiple
questions per mission — roughly 90 minutes, not 10.

---

## 7. Measuring performance

`renderer.info` gives draw calls and triangle counts. **It does not give FPS or frame time.**
Measure separately: sample `performance.now()` deltas in the animation loop over ≥ 300 frames
after the world has loaded, and report median and 95th-percentile frame time alongside
resolution, `pixelRatio`, browser and machine.

If the tool cannot run a browser, it reports **"unmeasured"** and lists this as a manual task.
It must not state an FPS figure it did not measure.

---

## 8. Working agreement

- **One primary tool writes code.** Others review or troubleshoot only.
- One checkpoint per request. Never "build the whole game".
- Every request ends with: what needs manual verification, and any deviation from SPEC.md
  with the reason.
- Update SPEC.md when a decision changes. It is the shared source of truth.
- Commit at every checkpoint.
