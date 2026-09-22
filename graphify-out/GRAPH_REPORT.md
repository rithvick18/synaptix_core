# Graph Report - 3D game  (2026-09-22)

## Corpus Check
- 80 files · ~132,614 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 1054 nodes · 2276 edges · 65 communities (44 shown, 21 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `892c1a28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- perf-templates.mjs
- pack.check.ts
- HintBeacon
- MissionRunner
- Three levels
- World.ts
- ChoiceCard
- boot
- package.json
- proceduralHouse.ts
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
- ui.ts
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
- grammar.ts
- review.ts
- MemoryPack.ts
- agent-images.check.ts
- firewall.ts
- profile-check.mjs
- main.ts
- agent-review.check.ts
- proposals.fixtures.ts
- FakeUI
- agent-provider.check.ts
- Quality.ts
- gemini.ts
- PlacedPlayer
- selectProvider.ts
- EnvironmentEditor.ts
- Q: How do uploaded images modify the game environment?
- tools.ts
- telemetry.check.ts
- world.capture.ts
- AdaptiveResolution
- Rig
- worldSnapshot.ts
- agent.check.ts
- FakeUI
- WorldSource
- State.ts

## God Nodes (most connected - your core abstractions)
1. `boot()` - 89 edges
2. `MissionRunner` - 33 edges
3. `buildHouse()` - 28 edges
4. `UI` - 28 edges
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

## Communities (65 total, 21 thin omitted)

### Community 0 - "perf-templates.mjs"
Cohesion: 0.18
Nodes (9): chrome, evaluate(), ONLY, pending, profile, REPO, rows, send() (+1 more)

### Community 1 - "pack.check.ts"
Cohesion: 0.14
Nodes (13): PackProblem, failures, fakeCtx, FakeImage, fakeLoad(), LoadFn, makeWorld(), MISSING (+5 more)

### Community 3 - "MissionRunner"
Cohesion: 0.19
Nodes (4): instructionOf(), MissionRunner, stopSpeaking(), Outcome

### Community 4 - "Three levels"
Cohesion: 0.09
Nodes (30): Deployment incomplete, Vercel and Netlify static hosting, Poly Haven runtime textures and HDRI, Smriti HTML entry, Smriti debug handle, Mira and Raju fictional demo packs, Headless and offline checks, Personalisation anchors (+22 more)

### Community 5 - "World.ts"
Cohesion: 0.23
Nodes (10): Focus, SwappedMaterial, assertWorldContract(), InteractableMeta, readMeta(), REQUIRED_ANCHORS, REQUIRED_HINT_TARGETS, REQUIRED_INTERACTABLES (+2 more)

### Community 7 - "boot"
Cohesion: 0.15
Nodes (3): boot(), escapeText(), UI

### Community 8 - "package.json"
Cohesion: 0.08
Nodes (22): dependencies, three, devDependencies, @types/node, @types/three, typescript, vite, name (+14 more)

### Community 9 - "proceduralHouse.ts"
Cohesion: 0.06
Nodes (54): three, colors, describeEnvironment(), EnvironmentStyle, validateEnvironment(), colourFor(), styleAnisotropy(), styleMaterial() (+46 more)

### Community 10 - "Recorder"
Cohesion: 0.16
Nodes (4): Recorder, endToEnd(), FakeState, makeWorld()

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
Cohesion: 0.12
Nodes (26): matchesType(), missingArgument(), runAuthoringPass(), SkippedCall, toProposals(), anchorLines(), assetLines(), AUTHORING_REASONING (+18 more)

### Community 19 - "agent-gemini.check.ts"
Cohesion: 0.09
Nodes (27): AgentConfig, agentConfigStore, AgentProvider, applySetupMode(), ConsentPrompt, consentPromptFor(), defaultModelForMode(), ensureConsent() (+19 more)

### Community 20 - "run.mjs"
Cohesion: 0.22
Nodes (8): checks, esbuild, filter, here, out, root, three, types

### Community 22 - "types.ts"
Cohesion: 0.09
Nodes (47): ARCH_HEIGHT, CEILING_HEIGHT, DOOR_HEIGHT, EXT_WALL_T, INT_WALL_T, PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y, PLAYER_RADIUS (+39 more)

### Community 23 - "checks/tsconfig.json"
Cohesion: 0.29
Nodes (6): ../../tsconfig.json, compilerOptions, noEmit, types, extends, include

### Community 24 - "ui.ts"
Cohesion: 0.12
Nodes (11): renderOnly(), DeviceInfo, EnvironmentReport, Renderer, AnswerCardOptions, LevelChoice, LevelSelectView, LoadStage (+3 more)

### Community 26 - "world.check.ts"
Cohesion: 0.11
Nodes (14): ANCHOR_PLATE, HouseWorld, templateFromLocation(), auditLines, cellIn(), configs, crossings(), cx() (+6 more)

### Community 37 - "llamaCpp.ts"
Cohesion: 0.14
Nodes (21): classifyStatus(), classifyThrown(), friendlyMessage(), imageBlock(), isLoopback(), isRetryable(), LlamaCppProviderAdapter, ParsedEnvelope (+13 more)

### Community 38 - "grammar.ts"
Cohesion: 0.39
Nodes (11): asNode(), buildProposalGrammar(), jsonKey(), kebab(), literal(), objectRule(), ParsedCall, parseProposalCalls() (+3 more)

### Community 39 - "review.ts"
Cohesion: 0.12
Nodes (17): Violation, computeProvenance(), ProvenanceBlock, ProposalStatus, ReviewCounts, ReviewedProposal, ReviewSession, CropHandles (+9 more)

### Community 40 - "MemoryPack.ts"
Cohesion: 0.05
Nodes (60): applyNonLevelProposal(), AssetUrlResolver, buildPackFromProposals(), Crop, LocalPerson, LocalProfile, newId(), newProfile() (+52 more)

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

### Community 46 - "proposals.fixtures.ts"
Cohesion: 0.16
Nodes (13): FirewallContext, baseContext(), CAREGIVER_FIELDS, CAREGIVER_TEXTS, makeAssets(), makeWorld(), ProposalFixture, sparseContext() (+5 more)

### Community 48 - "agent-provider.check.ts"
Cohesion: 0.13
Nodes (8): AuditEntry, AuditLog, AuditSink, consoleAuditSink, CONSENT_PROMPT, failures, REQUEST, WITH_IMAGE

### Community 49 - "Quality.ts"
Cohesion: 0.25
Nodes (10): AdaptiveStep, clampRatio(), detectQuality(), detectTier(), isSmall(), pixelRatioLadder(), qualityOverrideFromLocation(), QualityTier (+2 more)

### Community 50 - "gemini.ts"
Cohesion: 0.20
Nodes (14): ALLOWED_HOSTS, classifyStatus(), classifyThrown(), friendlyMessage(), GeminiProviderAdapter, imagePart(), InteractionStep, isGoogleEndpoint() (+6 more)

### Community 54 - "selectProvider.ts"
Cohesion: 0.23
Nodes (9): DEFAULT_GEMINI_MODEL, GeminiConfig, LlamaCppConfig, ProviderAdapter, EMPTY_STUB_SCRIPT, NullProviderAdapter, SelectProviderOptions, StubProviderAdapter (+1 more)

### Community 55 - "EnvironmentEditor.ts"
Cohesion: 0.50
Nodes (7): needsSetup(), geminiConfigFromEnv(), llamaCppConfigFromEnv(), selectProvider(), destinationLine(), environmentEditor(), waitingLine()

### Community 56 - "Q: How do uploaded images modify the game environment?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How do uploaded images modify the game environment?, Source Nodes

### Community 60 - "tools.ts"
Cohesion: 0.11
Nodes (24): AuthoringRun, construct(), dispatch(), ScriptedCall, ScriptedToolName, StubModel, ChoiceType, FindStepProposal (+16 more)

### Community 61 - "telemetry.check.ts"
Cohesion: 0.18
Nodes (9): buildExport(), dwellByObject(), missionIdsIn(), cleanRun, failures, fakePlayer, fakeVoices, miraPack (+1 more)

### Community 62 - "world.capture.ts"
Cohesion: 0.29
Nodes (6): TEMPLATES, out, snapshot, w, world, SNAPSHOT_PATH

### Community 63 - "AdaptiveResolution"
Cohesion: 0.20
Nodes (4): AdaptiveOptions, AdaptiveResolution, median(), replay()

### Community 64 - "Rig"
Cohesion: 0.18
Nodes (4): FakePlayer, FakeState, FakeVoices, Rig

### Community 65 - "worldSnapshot.ts"
Cohesion: 0.27
Nodes (12): snap(), box(), canonicalQuaternion(), diffSnapshots(), Json, material(), placement(), placements() (+4 more)

### Community 66 - "agent.check.ts"
Cohesion: 0.25
Nodes (5): DEFAULT_AGENT_CONFIG, PROPOSAL_FIXTURES, AGENT_TOOL_SCHEMA, failures, rulesSeen

### Community 69 - "WorldSource"
Cohesion: 0.33
Nodes (3): StepContext, WorldSource, SnapshotInput

### Community 70 - "State.ts"
Cohesion: 0.33
Nodes (5): GameState, MOVEMENT_ENABLED, POINTER_LOCK_WANTED, StateListener, TIMERS_RUN

## Knowledge Gaps
- **224 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+219 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 373 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `proceduralHouse.ts` to `pack.check.ts`, `worldSnapshot.ts`, `World.ts`, `package.json`, `MemoryPack.ts`, `main.ts`, `agent-review.check.ts`, `types.ts`, `ui.ts`, `world.check.ts`, `telemetry.check.ts`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `boot()` connect `boot` to `MissionRunner`, `World.ts`, `MemoryPack.ts`, `proceduralHouse.ts`, `Recorder`, `main.ts`, `Player`, `Telemetry`, `State`, `Quality.ts`, `Interaction`, `agent-gemini.check.ts`, `PackVoices`, `EnvironmentEditor.ts`, `ui.ts`, `world.check.ts`, `telemetry.check.ts`, `AdaptiveResolution`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `MissionRunner` connect `MissionRunner` to `Rig`, `pack.check.ts`, `HintBeacon`, `ChoiceCard`, `boot`, `MemoryPack.ts`, `Recorder`, `main.ts`, `telemetry.check.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `boot()` (e.g. with `.activate()` and `.clear()`) actually correct?**
  _`boot()` has 49 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _224 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pack.check.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1437908496732026 - nodes in this community are weakly interconnected._
- **Should `Three levels` be split into smaller, more focused modules?**
  _Cohesion score 0.0896551724137931 - nodes in this community are weakly interconnected._