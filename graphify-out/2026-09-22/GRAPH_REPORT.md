# Graph Report - 3D game  (2026-09-22)

## Corpus Check
- 63 files · ~102,209 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 936 nodes · 1914 edges · 63 communities (44 shown, 19 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 77 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b653cbf`
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
- Telemetry.ts
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
- Quality.ts
- gemini.ts
- loadMedia
- ui.ts
- validate
- selectProvider.ts
- EnvironmentEditor.ts
- Q: How do uploaded images modify the game environment?
- injectAnchors
- environment.ts
- three
- main.ts
- loadSet
- transaction

## God Nodes (most connected - your core abstractions)
1. `boot()` - 88 edges
2. `MissionRunner` - 33 edges
3. `UI` - 28 edges
4. `createProceduralHouse()` - 27 edges
5. `Telemetry` - 25 edges
6. `Player` - 23 edges
7. `State` - 19 edges
8. `ReviewSession` - 18 edges
9. `loadMedia()` - 17 edges
10. `three` - 15 edges

## Surprising Connections (you probably didn't know these)
- `mediaFor()` --calls--> `loadMedia()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `run()` --calls--> `environmentEditor()`  [EXTRACTED]
  tools/profile-browser.check.ts → src/EnvironmentEditor.ts
- `run()` --calls--> `styleMaterial()`  [EXTRACTED]
  tools/profile-browser.check.ts → src/EnvironmentMaterials.ts
- `mutate()` --calls--> `validate()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `Rig` --references--> `MissionRunner`  [EXTRACTED]
  tools/checks/pack.check.ts → src/Missions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three levels in one caregiver pack** — spec_memory_pack, spec_water, spec_morning_walk, spec_familiar_memories [EXTRACTED 1.00]

## Communities (63 total, 19 thin omitted)

### Community 0 - "MemoryPack.ts"
Cohesion: 0.10
Nodes (25): applyNonLevelProposal(), AssetUrlResolver, buildPackFromProposals(), breakagesFromLocation(), CardStyle, Json, LoadedPack, patientIdFromLocation() (+17 more)

### Community 1 - "pack.check.ts"
Cohesion: 0.06
Nodes (19): PackProblem, failures, fakeCtx, FakeImage, fakeLoad(), FakePlayer, FakeState, FakeUI (+11 more)

### Community 2 - "layout.ts"
Cohesion: 0.06
Nodes (33): ARCH_HEIGHT, ARCHES, AUDIO_SOURCE_ANCHOR, BEDSIDE_FRAME_ANCHOR, CHAIRS, DOOR_HEIGHT, EAST_DIV, EXT_WALL_T (+25 more)

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
Cohesion: 0.09
Nodes (25): BEDSIDE_FRAME_YAW, CEILING_HEIGHT, ChairSpec, DOORS, LIVING_ROOM_WALL_ANCHOR, LIVING_ROOM_WALL_YAW, OpeningSpec, ROOMS (+17 more)

### Community 7 - "boot"
Cohesion: 0.15
Nodes (3): boot(), escapeText(), UI

### Community 8 - "package.json"
Cohesion: 0.08
Nodes (22): dependencies, three, devDependencies, @types/node, @types/three, typescript, vite, name (+14 more)

### Community 9 - "createProceduralHouse"
Cohesion: 0.16
Nodes (20): Surface, auditDoorways(), auditReachability(), boxMesh(), buildChair(), buildFrameAnchor(), buildLamp(), buildPlant() (+12 more)

### Community 10 - "Telemetry.ts"
Cohesion: 0.18
Nodes (14): buildExport(), DWELL_THRESHOLD_MS, dwellByObject(), DwellTotal, EventListener, ExportContext, ExportDocument, mean() (+6 more)

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
Cohesion: 0.20
Nodes (6): cleanRun, failures, fakePlayer, fakeVoices, miraPack, textMedia

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
Cohesion: 0.17
Nodes (16): classifyStatus(), classifyThrown(), friendlyMessage(), imageBlock(), isLoopback(), isRetryable(), LlamaCppProviderAdapter, parseToolCalls() (+8 more)

### Community 38 - "tools.ts"
Cohesion: 0.10
Nodes (25): dispatch(), ScriptedCall, ScriptedToolName, AnchorSummary, AssetSummary, ChoiceType, FindStepProposal, hints (+17 more)

### Community 39 - "ReviewSession"
Cohesion: 0.21
Nodes (5): ReviewSession, ProposalReviewList, renderProvenanceSummary(), CaregiverInputRequest, ToolResult

### Community 40 - "LocalProfile.ts"
Cohesion: 0.26
Nodes (17): EnvironmentStyle, LocalPerson, LocalProfile, newId(), newProfile(), Photo, photosOf(), profileErrors() (+9 more)

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

### Community 49 - "Quality.ts"
Cohesion: 0.11
Nodes (16): AdaptiveOptions, AdaptiveResolution, AdaptiveStep, clampRatio(), detectQuality(), detectTier(), DeviceInfo, isSmall() (+8 more)

### Community 50 - "gemini.ts"
Cohesion: 0.20
Nodes (14): ALLOWED_HOSTS, classifyStatus(), classifyThrown(), friendlyMessage(), GeminiProviderAdapter, imagePart(), InteractionStep, isGoogleEndpoint() (+6 more)

### Community 51 - "loadMedia"
Cohesion: 0.18
Nodes (8): Crop, loadAudio(), loadImage(), loadMedia(), loadTexture(), PackMedia, placeholderTexture(), MediaResolver

### Community 52 - "ui.ts"
Cohesion: 0.18
Nodes (9): LoadOptions, MediaOptions, AnswerCardOptions, LevelChoice, LevelSelectView, LoadStage, RenderedProblem, StageProgress (+1 more)

### Community 53 - "validate"
Cohesion: 0.24
Nodes (7): isObject(), loadPack(), PackRejected, Problems, resolvePackPath(), validate(), validateStep()

### Community 54 - "selectProvider.ts"
Cohesion: 0.23
Nodes (9): DEFAULT_GEMINI_MODEL, GeminiConfig, LlamaCppConfig, ProviderAdapter, EMPTY_STUB_SCRIPT, NullProviderAdapter, SelectProviderOptions, StubProviderAdapter (+1 more)

### Community 55 - "EnvironmentEditor.ts"
Cohesion: 0.44
Nodes (8): needsSetup(), geminiConfigFromEnv(), receiveImage(), llamaCppConfigFromEnv(), selectProvider(), destinationLine(), environmentEditor(), waitingLine()

### Community 56 - "Q: How do uploaded images modify the game environment?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How do uploaded images modify the game environment?, Source Nodes

### Community 57 - "injectAnchors"
Cohesion: 0.67
Nodes (3): fitToPlate(), injectAnchors(), plateOf()

### Community 58 - "environment.ts"
Cohesion: 0.21
Nodes (9): colors, describeEnvironment(), validateEnvironment(), ProbeImage, image, material, provider, stored (+1 more)

### Community 59 - "three"
Cohesion: 0.24
Nodes (8): three, colourFor(), styleAnisotropy(), styleMaterial(), stylesSurface(), PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y, PLAYER_RADIUS

### Community 60 - "main.ts"
Cohesion: 0.22
Nodes (9): describe(), FocusProbe, percentile(), PerfResult, QualityProfile, downloadJson(), Event, exportFilename() (+1 more)

## Knowledge Gaps
- **216 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+211 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 349 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `boot()` connect `boot` to `MemoryPack.ts`, `MissionRunner`, `World.ts`, `createProceduralHouse`, `Telemetry.ts`, `Player`, `Telemetry`, `State`, `Recorder`, `agent-gemini.check.ts`, `PackVoices`, `Renderer`, `LocalProfile.ts`, `Quality.ts`, `loadMedia`, `ui.ts`, `validate`, `EnvironmentEditor.ts`, `injectAnchors`, `main.ts`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `three` connect `three` to `MemoryPack.ts`, `pack.check.ts`, `World.ts`, `proceduralHouse.ts`, `package.json`, `LocalProfile.ts`, `agent-review.check.ts`, `Quality.ts`, `telemetry.check.ts`, `environment.ts`, `main.ts`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `MissionRunner` connect `MissionRunner` to `MemoryPack.ts`, `pack.check.ts`, `boot`, `Recorder`, `telemetry.check.ts`, `main.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `boot()` (e.g. with `.activate()` and `.clear()`) actually correct?**
  _`boot()` has 49 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _216 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MemoryPack.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1010752688172043 - nodes in this community are weakly interconnected._
- **Should `pack.check.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0641025641025641 - nodes in this community are weakly interconnected._