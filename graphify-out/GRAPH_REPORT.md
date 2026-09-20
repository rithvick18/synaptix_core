# Graph Report - 3D game  (2026-09-20)

## Corpus Check
- 43 files · ~58,648 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: (none) 1)

## Summary
- 548 nodes · 988 edges · 37 communities (19 shown, 18 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 54 edges (avg confidence: 0.8)
- Token cost: unavailable from the host agent tools; stored zero counters are placeholders, not measured usage.

## Community Hubs (Navigation)
- Memory Pack Loading
- Pack Validation Checks
- House Layout Coordinates
- Mission Progression Hints
- Product Design Documentation
- World Interaction Contract
- House Asset Loading
- Game Screen UI
- Project Dependencies
- Procedural House Construction
- Session Export Context
- Offline Browser Checks
- Player Movement Collision
- Step Telemetry Events
- Demo Illustration Generation
- TypeScript Compilation
- Pause Timer State
- Recorder Integration Checks
- Export Validation Checks
- Rendering UI Types
- Test Runner Tooling
- Positional Voice Playback
- UI Test Doubles
- Test Compiler Configuration
- Frame Rendering
- Game State Constants
- Door Animation
- Demo Speech Generation
- Mira Portrait Illustration
- Festival Scene Illustration
- Green Portrait Illustration
- Gray Hair Illustration
- Lake Scene Illustration
- Bearded Portrait Illustration
- Blue Portrait Illustration
- Purple Portrait Illustration
- Performance Measurement

## God Nodes (most connected - your core abstractions)
1. `boot()` - 70 edges
2. `MissionRunner` - 33 edges
3. `UI` - 28 edges
4. `Telemetry` - 25 edges
5. `createProceduralHouse()` - 25 edges
6. `Player` - 23 edges
7. `State` - 19 edges
8. `compilerOptions` - 15 edges
9. `loadMedia()` - 14 edges
10. `PackMedia` - 13 edges

## Surprising Connections (you probably didn't know these)
- `mutate()` --calls--> `validate()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `mediaFor()` --calls--> `loadMedia()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `Rig` --references--> `MissionRunner`  [EXTRACTED]
  tools/checks/pack.check.ts → src/Missions.ts
- `endToEnd()` --calls--> `MissionRunner`  [EXTRACTED]
  tools/checks/telemetry.check.ts → src/Missions.ts
- `Rig` --calls--> `Telemetry`  [EXTRACTED]
  tools/checks/pack.check.ts → src/Telemetry.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three levels in one caregiver pack** — spec_memory_pack, spec_water, spec_morning_walk, spec_familiar_memories [EXTRACTED 1.00]

## Communities (37 total, 18 thin omitted)

### Community 0 - "Memory Pack Loading"
Cohesion: 0.07
Nodes (36): breakagesFromLocation(), CardStyle, fitToPlate(), injectAnchors(), isObject(), Json, loadAudio(), LoadedPack (+28 more)

### Community 1 - "Pack Validation Checks"
Cohesion: 0.06
Nodes (20): PackProblem, Mission, Event, failures, fakeCtx, FakeImage, fakeLoad(), FakePlayer (+12 more)

### Community 2 - "House Layout Coordinates"
Cohesion: 0.06
Nodes (35): ARCH_HEIGHT, BEDSIDE_FRAME_ANCHOR, BEDSIDE_FRAME_YAW, ChairSpec, DOOR_HEIGHT, DOORS, EAST_DIV, EXT_WALL_T (+27 more)

### Community 3 - "Mission Progression Hints"
Cohesion: 0.10
Nodes (7): HintBeacon, instructionOf(), MissionRunner, speak(), stopSpeaking(), Outcome, ChoiceCard

### Community 4 - "Product Design Documentation"
Cohesion: 0.09
Nodes (30): Deployment incomplete, Vercel and Netlify static hosting, Poly Haven runtime textures and HDRI, Smriti HTML entry, Smriti debug handle, Mira and Raju fictional demo packs, Headless and offline checks, Personalisation anchors (+22 more)

### Community 5 - "World Interaction Contract"
Cohesion: 0.11
Nodes (14): Focus, Interaction, SwappedMaterial, StepContext, assertWorldContract(), InteractableMeta, readMeta(), REQUIRED_ANCHORS (+6 more)

### Community 6 - "House Asset Loading"
Cohesion: 0.08
Nodes (25): ARCHES, AUDIO_SOURCE_ANCHOR, CEILING_HEIGHT, CHAIRS, LAMPS, OPENINGS, ROOMS, SolidSpec (+17 more)

### Community 8 - "Project Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, three, devDependencies, @types/node, @types/three, typescript, vite, name (+13 more)

### Community 9 - "Procedural House Construction"
Cohesion: 0.16
Nodes (20): Surface, auditDoorways(), auditReachability(), boxMesh(), buildChair(), buildFrameAnchor(), buildLamp(), buildPlant() (+12 more)

### Community 10 - "Session Export Context"
Cohesion: 0.13
Nodes (19): describe(), FocusProbe, percentile(), PerfResult, patientIdFromLocation(), downloadJson(), DWELL_THRESHOLD_MS, DwellTotal (+11 more)

### Community 11 - "Offline Browser Checks"
Cohesion: 0.10
Nodes (13): args, CDP, chrome, consoleErrors, failures, originArg, pageErrors, PERF (+5 more)

### Community 14 - "Demo Illustration Generation"
Cohesion: 0.29
Nodes (16): band(), blank(), disc(), ellipse(), glyph(), grain(), lerp(), over() (+8 more)

### Community 15 - "TypeScript Compilation"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 17 - "Recorder Integration Checks"
Cohesion: 0.16
Nodes (4): Recorder, endToEnd(), FakeState, makeWorld()

### Community 18 - "Export Validation Checks"
Cohesion: 0.18
Nodes (9): buildExport(), dwellByObject(), missionIdsIn(), cleanRun, failures, fakePlayer, fakeVoices, miraPack (+1 more)

### Community 19 - "Rendering UI Types"
Cohesion: 0.18
Nodes (9): three, EnvironmentReport, AnswerCardOptions, LevelChoice, LevelSelectView, LoadStage, RenderedProblem, StageProgress (+1 more)

### Community 20 - "Test Runner Tooling"
Cohesion: 0.22
Nodes (8): checks, esbuild, filter, here, out, root, three, types

### Community 23 - "Test Compiler Configuration"
Cohesion: 0.29
Nodes (6): ../../tsconfig.json, compilerOptions, noEmit, types, extends, include

### Community 25 - "Game State Constants"
Cohesion: 0.33
Nodes (5): GameState, MOVEMENT_ENABLED, POINTER_LOCK_WANTED, StateListener, TIMERS_RUN

## Knowledge Gaps
- **139 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+134 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 221 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `boot()` connect `Game Screen UI` to `Memory Pack Loading`, `Mission Progression Hints`, `World Interaction Contract`, `Procedural House Construction`, `Session Export Context`, `Player Movement Collision`, `Step Telemetry Events`, `Pause Timer State`, `Recorder Integration Checks`, `Export Validation Checks`, `Rendering UI Types`, `Positional Voice Playback`, `Frame Rendering`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `three` connect `Rendering UI Types` to `Memory Pack Loading`, `Pack Validation Checks`, `House Layout Coordinates`, `World Interaction Contract`, `House Asset Loading`, `Project Dependencies`, `Session Export Context`, `Export Validation Checks`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `MissionRunner` connect `Mission Progression Hints` to `Memory Pack Loading`, `Pack Validation Checks`, `Game Screen UI`, `Session Export Context`, `Recorder Integration Checks`, `Export Validation Checks`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 45 inferred relationships involving `boot()` (e.g. with `.activate()` and `.clear()`) actually correct?**
  _`boot()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Memory Pack Loading` be split into smaller, more focused modules?**
  _Cohesion score 0.06857142857142857 - nodes in this community are weakly interconnected._
- **Should `Pack Validation Checks` be split into smaller, more focused modules?**
  _Cohesion score 0.06341463414634146 - nodes in this community are weakly interconnected._
## Audit limitations

Token usage was unavailable from the agent tools; zero counters are placeholders, not measured usage. Six bundled MP3 files were not transcribed because optional faster-whisper is unavailable. Graph health: 18 dangling endpoint edges, 3 self-loops, and 7 undirected same-endpoint collapsed edges. This graph captures the pre-personalisation implementation while application edits proceeded concurrently.
