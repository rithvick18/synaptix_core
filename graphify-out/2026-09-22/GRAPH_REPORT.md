# Graph Report - 3D game  (2026-09-22)

## Corpus Check
- 76 files · ~121,812 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 1026 nodes · 2205 edges · 71 communities (53 shown, 18 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6ea0e357`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Missions.ts
- pack.check.ts
- three
- MissionRunner
- Three levels
- World.ts
- proceduralHouse.ts
- boot
- package.json
- buildHouse
- Recorder
- offline-check.mjs
- Player
- Telemetry
- make-photos.py
- compilerOptions
- State
- agent-prompts.check.ts
- Interaction
- agent-gemini.check.ts
- run.mjs
- PackVoices
- types.ts
- checks/tsconfig.json
- Renderer
- enabled.ts
- world.check.ts
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
- authoring.ts
- setupUI.ts
- LocalProfile.ts
- agent-images.check.ts
- firewall.ts
- profile-check.mjs
- main.ts
- agent-review.check.ts
- review.ts
- proposals.fixtures.ts
- audit.ts
- Quality.ts
- gemini.ts
- loadMedia
- ui.ts
- validate
- selectProvider.ts
- EnvironmentEditor.ts
- Q: How do uploaded images modify the game environment?
- MemoryPack.ts
- environment.ts
- createProceduralHouse
- tools.ts
- telemetry.check.ts
- index.ts
- AdaptiveResolution
- Rig
- worldSnapshot.ts
- agent.check.ts
- agent-provider.check.ts
- FakeUI
- WorldSource
- State.ts

## God Nodes (most connected - your core abstractions)
1. `boot()` - 89 edges
2. `MissionRunner` - 33 edges
3. `UI` - 28 edges
4. `buildHouse()` - 27 edges
5. `Telemetry` - 25 edges
6. `Player` - 23 edges
7. `State` - 19 edges
8. `ReviewSession` - 19 edges
9. `three` - 17 edges
10. `loadMedia()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `run()` --calls--> `environmentEditor()`  [EXTRACTED]
  tools/profile-browser.check.ts → src/EnvironmentEditor.ts
- `run()` --calls--> `styleMaterial()`  [EXTRACTED]
  tools/profile-browser.check.ts → src/EnvironmentMaterials.ts
- `mutate()` --calls--> `validate()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `mediaFor()` --calls--> `loadMedia()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `Rig` --references--> `MissionRunner`  [EXTRACTED]
  tools/checks/pack.check.ts → src/Missions.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three levels in one caregiver pack** — spec_memory_pack, spec_water, spec_morning_walk, spec_familiar_memories [EXTRACTED 1.00]

## Communities (71 total, 18 thin omitted)

### Community 0 - "Missions.ts"
Cohesion: 0.14
Nodes (16): applyNonLevelProposal(), AssetUrlResolver, buildPackFromProposals(), LoadedPack, ChoiceFormat, DemoNotice, FindStep, HINT_DELAYS_MS (+8 more)

### Community 1 - "pack.check.ts"
Cohesion: 0.14
Nodes (13): PackProblem, failures, fakeCtx, FakeImage, fakeLoad(), LoadFn, makeWorld(), MISSING (+5 more)

### Community 2 - "three"
Cohesion: 0.26
Nodes (10): three, ARCH_HEIGHT, CEILING_HEIGHT, DOOR_HEIGHT, EXT_WALL_T, INT_WALL_T, PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y (+2 more)

### Community 3 - "MissionRunner"
Cohesion: 0.10
Nodes (7): HintBeacon, instructionOf(), MissionRunner, speak(), stopSpeaking(), Outcome, ChoiceCard

### Community 4 - "Three levels"
Cohesion: 0.09
Nodes (30): Deployment incomplete, Vercel and Netlify static hosting, Poly Haven runtime textures and HDRI, Smriti HTML entry, Smriti debug handle, Mira and Raju fictional demo packs, Headless and offline checks, Personalisation anchors (+22 more)

### Community 5 - "World.ts"
Cohesion: 0.21
Nodes (11): Focus, SwappedMaterial, assertWorldContract(), InteractableMeta, readMeta(), REQUIRED_ANCHORS, REQUIRED_HINT_TARGETS, REQUIRED_INTERACTABLES (+3 more)

### Community 6 - "proceduralHouse.ts"
Cohesion: 0.13
Nodes (17): auditDoorways(), DoorwayReport, HouseBuildReport, HouseOptions, loadSet(), loadTexture(), MapTriplet, OPEN_ANGLE (+9 more)

### Community 7 - "boot"
Cohesion: 0.15
Nodes (3): boot(), escapeText(), UI

### Community 8 - "package.json"
Cohesion: 0.08
Nodes (22): dependencies, three, devDependencies, @types/node, @types/three, typescript, vite, name (+14 more)

### Community 9 - "buildHouse"
Cohesion: 0.16
Nodes (17): auditReachability(), buildChair(), buildFrameAnchor(), buildHouse(), buildLamp(), buildPlant(), buildProp(), buildTable() (+9 more)

### Community 10 - "Recorder"
Cohesion: 0.10
Nodes (5): Recorder, endToEnd(), FakeState, FakeUI, makeWorld()

### Community 11 - "offline-check.mjs"
Cohesion: 0.11
Nodes (16): args, CDP, chrome, consoleErrors, failures, navigateAndBoot(), ok(), originArg (+8 more)

### Community 14 - "make-photos.py"
Cohesion: 0.29
Nodes (16): band(), blank(), disc(), ellipse(), glyph(), grain(), lerp(), over() (+8 more)

### Community 15 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 17 - "agent-prompts.check.ts"
Cohesion: 0.14
Nodes (19): anchorLines(), assetLines(), AUTHORING_REASONING, AuthoringContext, buildAuthoringSystemPrompt(), bullets(), ENVIRONMENT_REASONING, ENVIRONMENT_SYSTEM_PROMPT (+11 more)

### Community 19 - "agent-gemini.check.ts"
Cohesion: 0.10
Nodes (26): AgentConfig, AgentProvider, applySetupMode(), ConsentPrompt, consentPromptFor(), defaultModelForMode(), ensureConsent(), isAgentProvider() (+18 more)

### Community 20 - "run.mjs"
Cohesion: 0.22
Nodes (8): checks, esbuild, filter, here, out, root, three, types

### Community 22 - "types.ts"
Cohesion: 0.13
Nodes (27): extent(), FACING, mirrorTemplate(), mirrorYaw(), mount(), neg(), opening(), point2() (+19 more)

### Community 23 - "checks/tsconfig.json"
Cohesion: 0.29
Nodes (6): ../../tsconfig.json, compilerOptions, noEmit, types, extends, include

### Community 26 - "world.check.ts"
Cohesion: 0.12
Nodes (14): ANCHOR_PLATE, HouseWorld, auditLines, cellIn(), configs, crossings(), cx(), cz() (+6 more)

### Community 37 - "llamaCpp.ts"
Cohesion: 0.16
Nodes (19): classifyStatus(), classifyThrown(), friendlyMessage(), imageBlock(), isLoopback(), isRetryable(), ParsedEnvelope, parseEnvelope() (+11 more)

### Community 38 - "authoring.ts"
Cohesion: 0.18
Nodes (20): AuthoringRun, matchesType(), missingArgument(), runAuthoringPass(), SkippedCall, toProposals(), asNode(), buildProposalGrammar() (+12 more)

### Community 39 - "setupUI.ts"
Cohesion: 0.14
Nodes (11): ProposalStatus, ReviewSession, CropHandles, ProposalReviewList, renderProvenanceSummary(), statusLabel(), summarise(), violationLine() (+3 more)

### Community 40 - "LocalProfile.ts"
Cohesion: 0.17
Nodes (22): Crop, LocalPerson, LocalProfile, newId(), newProfile(), openDatabase(), Photo, photosOf() (+14 more)

### Community 41 - "agent-images.check.ts"
Cohesion: 0.11
Nodes (16): ACCEPTED_MIME, dimensionsFor(), encode(), ImageDerivatives, ImagePipelineError, ImagePipelineErrorReason, nextPowerOfTwo(), receiveImage() (+8 more)

### Community 42 - "firewall.ts"
Cohesion: 0.17
Nodes (18): AssetRegistry, checkClinicalVocabulary(), checkHedgingAndForm(), checkHighlightTarget(), checkHints(), checkText(), checkTokensAgainstAllowlist(), CLINICAL_DENYLIST (+10 more)

### Community 43 - "profile-check.mjs"
Cohesion: 0.13
Nodes (10): /src/LocalProfile.ts, /tools/profile-browser.check.ts, args, CDP, chrome, originArg, profile, REPO (+2 more)

### Community 44 - "main.ts"
Cohesion: 0.13
Nodes (20): describe(), FocusProbe, percentile(), PerfResult, QualityProfile, downloadJson(), DWELL_THRESHOLD_MS, DwellTotal (+12 more)

### Community 45 - "agent-review.check.ts"
Cohesion: 0.16
Nodes (11): assets(), ctx(), emptyPack, failures, fakeCtx, FakeImage, fakeLoad(), firewallWorld() (+3 more)

### Community 46 - "review.ts"
Cohesion: 0.16
Nodes (13): FirewallContext, Violation, ProposalFixture, computeProvenance(), ProvenanceBlock, ReviewCounts, ReviewedProposal, buildAllowedTokens() (+5 more)

### Community 47 - "proposals.fixtures.ts"
Cohesion: 0.23
Nodes (18): construct(), baseContext(), CAREGIVER_FIELDS, CAREGIVER_TEXTS, makeAssets(), makeWorld(), sparseContext(), dispatch() (+10 more)

### Community 48 - "audit.ts"
Cohesion: 0.22
Nodes (4): AuditEntry, AuditLog, AuditSink, consoleAuditSink

### Community 49 - "Quality.ts"
Cohesion: 0.19
Nodes (12): AdaptiveStep, clampRatio(), detectQuality(), detectTier(), DeviceInfo, isSmall(), pixelRatioLadder(), qualityOverrideFromLocation() (+4 more)

### Community 50 - "gemini.ts"
Cohesion: 0.22
Nodes (14): ALLOWED_HOSTS, classifyStatus(), classifyThrown(), friendlyMessage(), imagePart(), InteractionStep, isGoogleEndpoint(), isRetryable() (+6 more)

### Community 51 - "loadMedia"
Cohesion: 0.18
Nodes (8): loadImage(), loadMedia(), loadPack(), PackMedia, PackRejected, placeholderTexture(), resolvePackPath(), mediaFor()

### Community 52 - "ui.ts"
Cohesion: 0.29
Nodes (6): AnswerCardOptions, LevelChoice, LevelSelectView, LoadStage, RenderedProblem, SummaryView

### Community 53 - "validate"
Cohesion: 0.52
Nodes (4): isObject(), Problems, validate(), validateStep()

### Community 54 - "selectProvider.ts"
Cohesion: 0.18
Nodes (11): DEFAULT_GEMINI_MODEL, GeminiConfig, GeminiProviderAdapter, LlamaCppConfig, LlamaCppProviderAdapter, ProviderAdapter, EMPTY_STUB_SCRIPT, NullProviderAdapter (+3 more)

### Community 55 - "EnvironmentEditor.ts"
Cohesion: 0.42
Nodes (8): agentConfigStore, needsSetup(), geminiConfigFromEnv(), llamaCppConfigFromEnv(), selectProvider(), destinationLine(), environmentEditor(), waitingLine()

### Community 56 - "Q: How do uploaded images modify the game environment?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How do uploaded images modify the game environment?, Source Nodes

### Community 57 - "MemoryPack.ts"
Cohesion: 0.18
Nodes (11): breakagesFromLocation(), CardStyle, fitToPlate(), injectAnchors(), Json, LoadOptions, MediaOptions, patientIdFromLocation() (+3 more)

### Community 58 - "environment.ts"
Cohesion: 0.21
Nodes (11): colors, describeEnvironment(), validateEnvironment(), colourFor(), styleAnisotropy(), styleMaterial(), image, material (+3 more)

### Community 59 - "createProceduralHouse"
Cohesion: 0.25
Nodes (8): EnvironmentStyle, stylesSurface(), boxMesh(), BuildOptions, createProceduralHouse(), Materials, scaleBoxUV(), Surface

### Community 60 - "tools.ts"
Cohesion: 0.12
Nodes (9): ChoiceType, FindStepProposal, hints, LevelProposal, NavigateStepProposal, PhotoPlacementProposal, ReadContext, rect (+1 more)

### Community 61 - "telemetry.check.ts"
Cohesion: 0.18
Nodes (9): buildExport(), dwellByObject(), missionIdsIn(), cleanRun, failures, fakePlayer, fakeVoices, miraPack (+1 more)

### Community 62 - "index.ts"
Cohesion: 0.18
Nodes (11): hallway, DEFAULT_TEMPLATE_ID, templateFromLocation(), TEMPLATES, TemplateSelection, Template, out, snapshot (+3 more)

### Community 63 - "AdaptiveResolution"
Cohesion: 0.20
Nodes (4): AdaptiveOptions, AdaptiveResolution, median(), replay()

### Community 64 - "Rig"
Cohesion: 0.18
Nodes (4): FakePlayer, FakeState, FakeVoices, Rig

### Community 65 - "worldSnapshot.ts"
Cohesion: 0.33
Nodes (10): box(), canonicalQuaternion(), Json, material(), placement(), placements(), plain(), scene() (+2 more)

### Community 66 - "agent.check.ts"
Cohesion: 0.18
Nodes (6): DEFAULT_AGENT_CONFIG, PROPOSAL_FIXTURES, StubModel, AGENT_TOOL_SCHEMA, failures, rulesSeen

### Community 67 - "agent-provider.check.ts"
Cohesion: 0.22
Nodes (4): CONSENT_PROMPT, failures, REQUEST, WITH_IMAGE

### Community 69 - "WorldSource"
Cohesion: 0.33
Nodes (3): StepContext, WorldSource, SnapshotInput

### Community 70 - "State.ts"
Cohesion: 0.33
Nodes (5): GameState, MOVEMENT_ENABLED, POINTER_LOCK_WANTED, StateListener, TIMERS_RUN

## Knowledge Gaps
- **213 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+208 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 355 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `three` to `Missions.ts`, `pack.check.ts`, `worldSnapshot.ts`, `world.check.ts`, `World.ts`, `proceduralHouse.ts`, `package.json`, `LocalProfile.ts`, `main.ts`, `agent-review.check.ts`, `Quality.ts`, `MemoryPack.ts`, `environment.ts`, `telemetry.check.ts`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `boot()` connect `boot` to `MissionRunner`, `World.ts`, `Recorder`, `Player`, `Telemetry`, `State`, `Interaction`, `agent-gemini.check.ts`, `PackVoices`, `Renderer`, `LocalProfile.ts`, `main.ts`, `Quality.ts`, `loadMedia`, `validate`, `EnvironmentEditor.ts`, `MemoryPack.ts`, `createProceduralHouse`, `telemetry.check.ts`, `index.ts`, `AdaptiveResolution`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `MissionRunner` connect `MissionRunner` to `Missions.ts`, `pack.check.ts`, `Rig`, `boot`, `Recorder`, `main.ts`, `telemetry.check.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `boot()` (e.g. with `.activate()` and `.clear()`) actually correct?**
  _`boot()` has 49 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _213 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Missions.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1437908496732026 - nodes in this community are weakly interconnected._
- **Should `pack.check.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1437908496732026 - nodes in this community are weakly interconnected._