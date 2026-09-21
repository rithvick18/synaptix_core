# Graph Report - 3D game  (2026-09-21)

## Corpus Check
- 53 files · ~85,155 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 827 nodes · 1620 edges · 48 communities (31 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cd8f09cf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MemoryPack.ts
- pack.check.ts
- layout.ts
- MissionRunner
- Three levels
- World.ts
- proceduralHouse.ts
- boot
- package.json
- createProceduralHouse
- main.ts
- offline-check.mjs
- Player
- Telemetry
- make-photos.py
- compilerOptions
- State
- Recorder
- telemetry.check.ts
- three
- run.mjs
- PackVoices
- FakeUI
- checks/tsconfig.json
- Renderer
- State.ts
- Door
- make-media.sh
- Illustrated portrait with dark hair, pink clothing, and letter A
- Illustration of four silhouettes around a warm light beneath an orange sky
- Illustrated portrait with dark hair bun, green clothing, and letter B
- Illustrated portrait with gray hair bun, yellow clothing, and letter R
- Illustration of a sailboat on blue water with sun and birds
- Illustrated portrait with pale hair and beard, green clothing, and letter I
- Illustrated portrait with dark hair and beard, blue clothing, and letter M
- Illustrated portrait with pale hair bun, purple clothing, and letter S
- Measured frame time
- agent-provider.check.ts
- tools.ts
- setupUI.ts
- LocalProfile.ts
- agent-images.check.ts
- firewall.ts
- profile-check.mjs
- review.ts
- agent-review.check.ts
- proposals.fixtures.ts
- agent.check.ts

## God Nodes (most connected - your core abstractions)
1. `boot()` - 77 edges
2. `MissionRunner` - 33 edges
3. `UI` - 28 edges
4. `Telemetry` - 25 edges
5. `createProceduralHouse()` - 25 edges
6. `Player` - 23 edges
7. `State` - 19 edges
8. `ReviewSession` - 18 edges
9. `loadMedia()` - 17 edges
10. `compilerOptions` - 15 edges

## Surprising Connections (you probably didn't know these)
- `mutate()` --calls--> `validate()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `mediaFor()` --calls--> `loadMedia()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `Rig` --references--> `MissionRunner`  [EXTRACTED]
  tools/checks/pack.check.ts → src/Missions.ts
- `endToEnd()` --calls--> `MissionRunner`  [EXTRACTED]
  tools/checks/telemetry.check.ts → src/Missions.ts
- `run()` --calls--> `MediaResolver`  [EXTRACTED]
  tools/profile-browser.check.ts → src/PhotoMedia.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three levels in one caregiver pack** — spec_memory_pack, spec_water, spec_morning_walk, spec_familiar_memories [EXTRACTED 1.00]

## Communities (48 total, 17 thin omitted)

### Community 0 - "MemoryPack.ts"
Cohesion: 0.05
Nodes (49): applyNonLevelProposal(), AssetUrlResolver, buildPackFromProposals(), breakagesFromLocation(), CardStyle, fitToPlate(), injectAnchors(), isObject() (+41 more)

### Community 1 - "pack.check.ts"
Cohesion: 0.06
Nodes (18): PackProblem, failures, fakeCtx, FakeImage, fakeLoad(), FakePlayer, FakeState, FakeUI (+10 more)

### Community 2 - "layout.ts"
Cohesion: 0.06
Nodes (33): ARCH_HEIGHT, ARCHES, AUDIO_SOURCE_ANCHOR, BEDSIDE_FRAME_ANCHOR, CHAIRS, ChairSpec, DOOR_HEIGHT, EAST_DIV (+25 more)

### Community 3 - "MissionRunner"
Cohesion: 0.10
Nodes (7): HintBeacon, instructionOf(), MissionRunner, speak(), stopSpeaking(), Outcome, ChoiceCard

### Community 4 - "Three levels"
Cohesion: 0.09
Nodes (30): Deployment incomplete, Vercel and Netlify static hosting, Poly Haven runtime textures and HDRI, Smriti HTML entry, Smriti debug handle, Mira and Raju fictional demo packs, Headless and offline checks, Personalisation anchors (+22 more)

### Community 5 - "World.ts"
Cohesion: 0.11
Nodes (14): Focus, Interaction, SwappedMaterial, StepContext, assertWorldContract(), InteractableMeta, readMeta(), REQUIRED_ANCHORS (+6 more)

### Community 6 - "proceduralHouse.ts"
Cohesion: 0.08
Nodes (24): BEDSIDE_FRAME_YAW, CEILING_HEIGHT, DOORS, FURNITURE, JUG_POSITION, LIVING_ROOM_WALL_ANCHOR, LIVING_ROOM_WALL_YAW, OpeningSpec (+16 more)

### Community 7 - "boot"
Cohesion: 0.15
Nodes (3): boot(), escapeText(), UI

### Community 8 - "package.json"
Cohesion: 0.08
Nodes (22): dependencies, three, devDependencies, @types/node, @types/three, typescript, vite, name (+14 more)

### Community 9 - "createProceduralHouse"
Cohesion: 0.16
Nodes (20): Surface, auditDoorways(), auditReachability(), boxMesh(), buildChair(), buildFrameAnchor(), buildLamp(), buildPlant() (+12 more)

### Community 10 - "main.ts"
Cohesion: 0.13
Nodes (19): describe(), FocusProbe, percentile(), PerfResult, downloadJson(), DWELL_THRESHOLD_MS, DwellTotal, Event (+11 more)

### Community 11 - "offline-check.mjs"
Cohesion: 0.10
Nodes (13): args, CDP, chrome, consoleErrors, failures, originArg, pageErrors, PERF (+5 more)

### Community 14 - "make-photos.py"
Cohesion: 0.29
Nodes (16): band(), blank(), disc(), ellipse(), glyph(), grain(), lerp(), over() (+8 more)

### Community 15 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 17 - "Recorder"
Cohesion: 0.16
Nodes (4): Recorder, endToEnd(), FakeState, makeWorld()

### Community 18 - "telemetry.check.ts"
Cohesion: 0.18
Nodes (9): buildExport(), dwellByObject(), missionIdsIn(), cleanRun, failures, fakePlayer, fakeVoices, miraPack (+1 more)

### Community 19 - "three"
Cohesion: 0.40
Nodes (4): three, PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y, PLAYER_RADIUS

### Community 20 - "run.mjs"
Cohesion: 0.22
Nodes (8): checks, esbuild, filter, here, out, root, three, types

### Community 23 - "checks/tsconfig.json"
Cohesion: 0.29
Nodes (6): ../../tsconfig.json, compilerOptions, noEmit, types, extends, include

### Community 25 - "State.ts"
Cohesion: 0.33
Nodes (5): GameState, MOVEMENT_ENABLED, POINTER_LOCK_WANTED, StateListener, TIMERS_RUN

### Community 37 - "agent-provider.check.ts"
Cohesion: 0.06
Nodes (43): AuditEntry, AuditLog, AuditSink, consoleAuditSink, AgentConfig, agentConfigStore, AgentProvider, CONSENT_PROMPT (+35 more)

### Community 38 - "tools.ts"
Cohesion: 0.10
Nodes (25): dispatch(), ScriptedCall, ScriptedToolName, AnchorSummary, AssetSummary, ChoiceType, FindStepProposal, hints (+17 more)

### Community 39 - "setupUI.ts"
Cohesion: 0.13
Nodes (14): Violation, ReviewedProposal, ReviewSession, CropHandles, ProposalReviewList, renderProvenanceSummary(), statusLabel(), summarise() (+6 more)

### Community 40 - "LocalProfile.ts"
Cohesion: 0.21
Nodes (20): Crop, LocalPerson, LocalProfile, newId(), newProfile(), openDatabase(), Photo, photosOf() (+12 more)

### Community 41 - "agent-images.check.ts"
Cohesion: 0.11
Nodes (16): ACCEPTED_MIME, dimensionsFor(), encode(), ImageDerivatives, ImagePipelineError, ImagePipelineErrorReason, nextPowerOfTwo(), receiveImage() (+8 more)

### Community 42 - "firewall.ts"
Cohesion: 0.17
Nodes (18): AssetRegistry, checkClinicalVocabulary(), checkHedgingAndForm(), checkHighlightTarget(), checkHints(), checkText(), checkTokensAgainstAllowlist(), CLINICAL_DENYLIST (+10 more)

### Community 43 - "profile-check.mjs"
Cohesion: 0.13
Nodes (10): /src/LocalProfile.ts, /tools/profile-browser.check.ts, args, CDP, chrome, originArg, profile, REPO (+2 more)

### Community 44 - "review.ts"
Cohesion: 0.21
Nodes (9): computeProvenance(), ProvenanceBlock, ProposalStatus, ReviewCounts, buildAllowedTokens(), CaregiverInputs, words(), ctx() (+1 more)

### Community 45 - "agent-review.check.ts"
Cohesion: 0.16
Nodes (11): assets(), ctx(), emptyPack, failures, fakeCtx, FakeImage, fakeLoad(), firewallWorld() (+3 more)

### Community 46 - "proposals.fixtures.ts"
Cohesion: 0.24
Nodes (9): FirewallContext, baseContext(), CAREGIVER_FIELDS, CAREGIVER_TEXTS, makeAssets(), makeWorld(), ProposalFixture, sparseContext() (+1 more)

### Community 47 - "agent.check.ts"
Cohesion: 0.20
Nodes (5): PROPOSAL_FIXTURES, StubModel, AGENT_TOOL_SCHEMA, failures, rulesSeen

## Knowledge Gaps
- **195 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+190 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 316 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `boot()` connect `boot` to `MemoryPack.ts`, `MissionRunner`, `World.ts`, `LocalProfile.ts`, `createProceduralHouse`, `main.ts`, `Player`, `Telemetry`, `State`, `Recorder`, `telemetry.check.ts`, `PackVoices`, `Renderer`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `three` connect `three` to `MemoryPack.ts`, `pack.check.ts`, `World.ts`, `proceduralHouse.ts`, `package.json`, `main.ts`, `agent-review.check.ts`, `telemetry.check.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `MissionRunner` connect `MissionRunner` to `MemoryPack.ts`, `pack.check.ts`, `boot`, `main.ts`, `Recorder`, `telemetry.check.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 45 inferred relationships involving `boot()` (e.g. with `.activate()` and `.clear()`) actually correct?**
  _`boot()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _195 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MemoryPack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05010351966873706 - nodes in this community are weakly interconnected._
- **Should `pack.check.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0641025641025641 - nodes in this community are weakly interconnected._