# Graph Report - 3D game  (2026-09-21)

## Corpus Check
- 61 files · ~95,276 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 898 nodes · 1827 edges · 58 communities (41 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 71 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b653cbf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MemoryPack.ts
- FakeUI
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
- agent-gemini.check.ts
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
- llamaCpp.ts
- tools.ts
- ReviewSession
- LocalProfile.ts
- agent-images.check.ts
- firewall.ts
- profile-check.mjs
- setupUI.ts
- agent-review.check.ts
- proposals.fixtures.ts
- agent.check.ts
- agent-provider.check.ts
- pack.check.ts
- gemini.ts
- loadMedia
- ui.ts
- validate
- selectProvider.ts
- EnvironmentEditor.ts
- Q: How do uploaded images modify the game environment?
- injectAnchors

## God Nodes (most connected - your core abstractions)
1. `boot()` - 80 edges
2. `MissionRunner` - 33 edges
3. `UI` - 28 edges
4. `Telemetry` - 25 edges
5. `createProceduralHouse()` - 25 edges
6. `Player` - 23 edges
7. `State` - 19 edges
8. `ReviewSession` - 18 edges
9. `loadMedia()` - 17 edges
10. `three` - 15 edges

## Surprising Connections (you probably didn't know these)
- `run()` --calls--> `environmentEditor()`  [EXTRACTED]
  tools/profile-browser.check.ts → src/EnvironmentEditor.ts
- `mutate()` --calls--> `validate()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `mediaFor()` --calls--> `loadMedia()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `Rig` --references--> `MissionRunner`  [EXTRACTED]
  tools/checks/pack.check.ts → src/Missions.ts
- `endToEnd()` --calls--> `MissionRunner`  [EXTRACTED]
  tools/checks/telemetry.check.ts → src/Missions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three levels in one caregiver pack** — spec_memory_pack, spec_water, spec_morning_walk, spec_familiar_memories [EXTRACTED 1.00]

## Communities (58 total, 17 thin omitted)

### Community 0 - "MemoryPack.ts"
Cohesion: 0.10
Nodes (24): applyNonLevelProposal(), AssetUrlResolver, buildPackFromProposals(), breakagesFromLocation(), CardStyle, Json, LoadedPack, patientIdFromLocation() (+16 more)

### Community 1 - "FakeUI"
Cohesion: 0.10
Nodes (5): FakePlayer, FakeState, FakeUI, FakeVoices, Rig

### Community 2 - "layout.ts"
Cohesion: 0.06
Nodes (35): ARCH_HEIGHT, BEDSIDE_FRAME_ANCHOR, BEDSIDE_FRAME_YAW, ChairSpec, DOOR_HEIGHT, DOORS, EAST_DIV, EXT_WALL_T (+27 more)

### Community 3 - "MissionRunner"
Cohesion: 0.10
Nodes (7): HintBeacon, instructionOf(), MissionRunner, speak(), stopSpeaking(), Outcome, ChoiceCard

### Community 4 - "Three levels"
Cohesion: 0.09
Nodes (30): Deployment incomplete, Vercel and Netlify static hosting, Poly Haven runtime textures and HDRI, Smriti HTML entry, Smriti debug handle, Mira and Raju fictional demo packs, Headless and offline checks, Personalisation anchors (+22 more)

### Community 5 - "World.ts"
Cohesion: 0.13
Nodes (12): Focus, Interaction, SwappedMaterial, assertWorldContract(), InteractableMeta, readMeta(), REQUIRED_ANCHORS, REQUIRED_HINT_TARGETS (+4 more)

### Community 6 - "proceduralHouse.ts"
Cohesion: 0.08
Nodes (25): ARCHES, AUDIO_SOURCE_ANCHOR, CEILING_HEIGHT, CHAIRS, LAMPS, OPENINGS, ROOMS, SolidSpec (+17 more)

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

### Community 19 - "agent-gemini.check.ts"
Cohesion: 0.09
Nodes (27): AgentConfig, agentConfigStore, AgentProvider, applySetupMode(), ConsentPrompt, consentPromptFor(), defaultModelForMode(), ensureConsent() (+19 more)

### Community 20 - "run.mjs"
Cohesion: 0.22
Nodes (8): checks, esbuild, filter, here, out, root, three, types

### Community 23 - "checks/tsconfig.json"
Cohesion: 0.29
Nodes (6): ../../tsconfig.json, compilerOptions, noEmit, types, extends, include

### Community 25 - "State.ts"
Cohesion: 0.33
Nodes (5): GameState, MOVEMENT_ENABLED, POINTER_LOCK_WANTED, StateListener, TIMERS_RUN

### Community 37 - "llamaCpp.ts"
Cohesion: 0.14
Nodes (19): classifyStatus(), classifyThrown(), friendlyMessage(), imageBlock(), isLoopback(), isRetryable(), LlamaCppProviderAdapter, parseToolCalls() (+11 more)

### Community 38 - "tools.ts"
Cohesion: 0.10
Nodes (25): dispatch(), ScriptedCall, ScriptedToolName, AnchorSummary, AssetSummary, ChoiceType, FindStepProposal, hints (+17 more)

### Community 39 - "ReviewSession"
Cohesion: 0.21
Nodes (5): ReviewSession, ProposalReviewList, renderProvenanceSummary(), CaregiverInputRequest, ToolResult

### Community 40 - "LocalProfile.ts"
Cohesion: 0.12
Nodes (31): three, colors, describeEnvironment(), EnvironmentStyle, validateEnvironment(), styleMaterial(), Crop, LocalPerson (+23 more)

### Community 41 - "agent-images.check.ts"
Cohesion: 0.10
Nodes (15): ACCEPTED_MIME, dimensionsFor(), encode(), ImageDerivatives, ImagePipelineError, ImagePipelineErrorReason, nextPowerOfTwo(), eq() (+7 more)

### Community 42 - "firewall.ts"
Cohesion: 0.17
Nodes (18): AssetRegistry, checkClinicalVocabulary(), checkHedgingAndForm(), checkHighlightTarget(), checkHints(), checkText(), checkTokensAgainstAllowlist(), CLINICAL_DENYLIST (+10 more)

### Community 43 - "profile-check.mjs"
Cohesion: 0.13
Nodes (10): /src/LocalProfile.ts, /tools/profile-browser.check.ts, args, CDP, chrome, originArg, profile, REPO (+2 more)

### Community 44 - "setupUI.ts"
Cohesion: 0.17
Nodes (13): Violation, computeProvenance(), ProvenanceBlock, ProposalStatus, ReviewCounts, ReviewedProposal, CropHandles, statusLabel() (+5 more)

### Community 45 - "agent-review.check.ts"
Cohesion: 0.16
Nodes (11): assets(), ctx(), emptyPack, failures, fakeCtx, FakeImage, fakeLoad(), firewallWorld() (+3 more)

### Community 46 - "proposals.fixtures.ts"
Cohesion: 0.16
Nodes (14): FirewallContext, baseContext(), CAREGIVER_FIELDS, CAREGIVER_TEXTS, makeAssets(), makeWorld(), ProposalFixture, sparseContext() (+6 more)

### Community 47 - "agent.check.ts"
Cohesion: 0.18
Nodes (6): DEFAULT_AGENT_CONFIG, PROPOSAL_FIXTURES, StubModel, AGENT_TOOL_SCHEMA, failures, rulesSeen

### Community 48 - "agent-provider.check.ts"
Cohesion: 0.13
Nodes (8): AuditEntry, AuditLog, AuditSink, consoleAuditSink, CONSENT_PROMPT, failures, REQUEST, WITH_IMAGE

### Community 49 - "pack.check.ts"
Cohesion: 0.14
Nodes (13): PackProblem, failures, fakeCtx, FakeImage, fakeLoad(), LoadFn, makeWorld(), MISSING (+5 more)

### Community 50 - "gemini.ts"
Cohesion: 0.21
Nodes (13): ALLOWED_HOSTS, classifyStatus(), classifyThrown(), friendlyMessage(), GeminiProviderAdapter, imagePart(), InteractionStep, isGoogleEndpoint() (+5 more)

### Community 51 - "loadMedia"
Cohesion: 0.23
Nodes (7): loadAudio(), loadImage(), loadMedia(), loadTexture(), PackMedia, placeholderTexture(), mediaFor()

### Community 52 - "ui.ts"
Cohesion: 0.17
Nodes (10): LoadOptions, MediaOptions, EnvironmentReport, AnswerCardOptions, LevelChoice, LevelSelectView, LoadStage, RenderedProblem (+2 more)

### Community 53 - "validate"
Cohesion: 0.24
Nodes (7): isObject(), loadPack(), PackRejected, Problems, resolvePackPath(), validate(), validateStep()

### Community 54 - "selectProvider.ts"
Cohesion: 0.27
Nodes (8): DEFAULT_GEMINI_MODEL, GeminiConfig, LlamaCppConfig, ProviderRequest, EMPTY_STUB_SCRIPT, SelectProviderOptions, StubProviderAdapter, StubModelScript

### Community 55 - "EnvironmentEditor.ts"
Cohesion: 0.44
Nodes (8): needsSetup(), geminiConfigFromEnv(), receiveImage(), llamaCppConfigFromEnv(), selectProvider(), destinationLine(), environmentEditor(), waitingLine()

### Community 56 - "Q: How do uploaded images modify the game environment?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How do uploaded images modify the game environment?, Source Nodes

### Community 57 - "injectAnchors"
Cohesion: 0.67
Nodes (3): fitToPlate(), injectAnchors(), plateOf()

## Knowledge Gaps
- **214 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+209 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 341 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `LocalProfile.ts` to `MemoryPack.ts`, `layout.ts`, `World.ts`, `proceduralHouse.ts`, `package.json`, `main.ts`, `agent-review.check.ts`, `pack.check.ts`, `telemetry.check.ts`, `ui.ts`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `boot()` connect `boot` to `MemoryPack.ts`, `MissionRunner`, `World.ts`, `createProceduralHouse`, `main.ts`, `Player`, `Telemetry`, `State`, `Recorder`, `telemetry.check.ts`, `agent-gemini.check.ts`, `PackVoices`, `Renderer`, `LocalProfile.ts`, `loadMedia`, `ui.ts`, `validate`, `EnvironmentEditor.ts`, `injectAnchors`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `MissionRunner` connect `MissionRunner` to `MemoryPack.ts`, `FakeUI`, `boot`, `main.ts`, `pack.check.ts`, `telemetry.check.ts`, `Recorder`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 45 inferred relationships involving `boot()` (e.g. with `.activate()` and `.clear()`) actually correct?**
  _`boot()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _214 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MemoryPack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._
- **Should `FakeUI` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._