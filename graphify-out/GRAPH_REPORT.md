# Graph Report - 3D game  (2026-09-23)

## Corpus Check
- 82 files · ~137,198 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 1071 nodes · 2336 edges · 67 communities (46 shown, 21 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `43b667fd`
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
- Missions.ts
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
- world.check.ts
- checks/tsconfig.json
- main.ts
- enabled.ts
- tools.ts
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
- LocalProfile.ts
- agent-images.check.ts
- firewall.ts
- profile-check.mjs
- telemetry.check.ts
- agent-review.check.ts
- agent-provenance.check.ts
- MemoryPack.ts
- agent-provider.check.ts
- Quality.ts
- gemini.ts
- PlacedPlayer
- loadMedia
- ReviewSession
- selectProvider.ts
- EnvironmentEditor.ts
- Q: How do uploaded images modify the game environment?
- proposals.fixtures.ts
- Proposal
- Renderer
- authoring.ts
- validate
- toProposals
- Rig
- agent.check.ts
- FakeUI
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
- `SnapshotInput` --references--> `WorldSource`  [EXTRACTED]
  tools/checks/worldSnapshot.ts → src/World.ts
- `run()` --calls--> `environmentEditor()`  [EXTRACTED]
  tools/profile-browser.check.ts → src/EnvironmentEditor.ts
- `run()` --calls--> `styleMaterial()`  [EXTRACTED]
  tools/profile-browser.check.ts → src/EnvironmentMaterials.ts
- `mutate()` --calls--> `validate()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts
- `mediaFor()` --calls--> `loadMedia()`  [EXTRACTED]
  tools/checks/pack.check.ts → src/MemoryPack.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three levels in one caregiver pack** — spec_memory_pack, spec_water, spec_morning_walk, spec_familiar_memories [EXTRACTED 1.00]

## Communities (67 total, 21 thin omitted)

### Community 0 - "perf-templates.mjs"
Cohesion: 0.18
Nodes (9): chrome, evaluate(), ONLY, pending, profile, REPO, rows, send() (+1 more)

### Community 1 - "pack.check.ts"
Cohesion: 0.14
Nodes (13): PackProblem, failures, fakeCtx, FakeImage, fakeLoad(), LoadFn, makeWorld(), MISSING (+5 more)

### Community 3 - "MissionRunner"
Cohesion: 0.18
Nodes (4): instructionOf(), MissionRunner, stopSpeaking(), Outcome

### Community 4 - "Three levels"
Cohesion: 0.09
Nodes (30): Deployment incomplete, Vercel and Netlify static hosting, Poly Haven runtime textures and HDRI, Smriti HTML entry, Smriti debug handle, Mira and Raju fictional demo packs, Headless and offline checks, Personalisation anchors (+22 more)

### Community 5 - "World.ts"
Cohesion: 0.14
Nodes (14): Focus, SwappedMaterial, StepContext, MissionRunnerDeps, assertWorldContract(), InteractableMeta, readMeta(), REQUIRED_ANCHORS (+6 more)

### Community 7 - "boot"
Cohesion: 0.15
Nodes (3): boot(), escapeText(), UI

### Community 8 - "package.json"
Cohesion: 0.08
Nodes (22): dependencies, three, devDependencies, @types/node, @types/three, typescript, vite, name (+14 more)

### Community 9 - "proceduralHouse.ts"
Cohesion: 0.05
Nodes (71): EnvironmentStyle, colourFor(), styleAnisotropy(), styleMaterial(), stylesSurface(), auditDoorways(), auditReachability(), boxMesh() (+63 more)

### Community 10 - "Missions.ts"
Cohesion: 0.15
Nodes (15): applyNonLevelProposal(), AssetUrlResolver, buildPackFromProposals(), LoadedPack, ChoiceFormat, DemoNotice, FindStep, HINT_DELAYS_MS (+7 more)

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
Cohesion: 0.13
Nodes (19): ParsedEnvelope, anchorLines(), assetLines(), AUTHORING_REASONING, AuthoringContext, buildAuthoringSystemPrompt(), bullets(), PROMPT_VERSION (+11 more)

### Community 19 - "agent-gemini.check.ts"
Cohesion: 0.09
Nodes (25): AgentConfig, agentConfigStore, AgentProvider, CONSENT_PROMPT, ConsentPrompt, consentPromptFor(), ensureConsent(), isAgentProvider() (+17 more)

### Community 20 - "run.mjs"
Cohesion: 0.22
Nodes (8): checks, esbuild, filter, here, out, root, three, types

### Community 22 - "world.check.ts"
Cohesion: 0.06
Nodes (55): ARCH_HEIGHT, CEILING_HEIGHT, DOOR_HEIGHT, EXT_WALL_T, INT_WALL_T, PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y, PLAYER_RADIUS (+47 more)

### Community 23 - "checks/tsconfig.json"
Cohesion: 0.29
Nodes (6): ../../tsconfig.json, compilerOptions, noEmit, types, extends, include

### Community 24 - "main.ts"
Cohesion: 0.13
Nodes (16): three, describe(), FocusProbe, percentile(), PerfResult, breakagesFromLocation(), patientIdFromLocation(), QualityProfile (+8 more)

### Community 26 - "tools.ts"
Cohesion: 0.12
Nodes (9): ChoiceType, FindStepProposal, hints, JsonSchemaTool, LevelProposal, NavigateStepProposal, PhotoPlacementProposal, ReadContext (+1 more)

### Community 37 - "llamaCpp.ts"
Cohesion: 0.18
Nodes (17): classifyStatus(), classifyThrown(), friendlyMessage(), imageBlock(), isLoopback(), isRetryable(), parseEnvelope(), toolCallSchema() (+9 more)

### Community 38 - "grammar.ts"
Cohesion: 0.39
Nodes (11): asNode(), buildProposalGrammar(), jsonKey(), kebab(), literal(), objectRule(), ParsedCall, parseProposalCalls() (+3 more)

### Community 39 - "review.ts"
Cohesion: 0.22
Nodes (10): Violation, ProposalStatus, ReviewCounts, ReviewedProposal, CropHandles, statusLabel(), summarise(), violationLine() (+2 more)

### Community 40 - "LocalProfile.ts"
Cohesion: 0.13
Nodes (31): applySetupMode(), defaultModelForMode(), providerForMode(), Crop, LocalPerson, LocalProfile, newId(), newProfile() (+23 more)

### Community 41 - "agent-images.check.ts"
Cohesion: 0.10
Nodes (15): ACCEPTED_MIME, dimensionsFor(), encode(), ImageDerivatives, ImagePipelineError, ImagePipelineErrorReason, nextPowerOfTwo(), eq() (+7 more)

### Community 42 - "firewall.ts"
Cohesion: 0.16
Nodes (19): AssetRegistry, checkClinicalVocabulary(), checkHedgingAndForm(), checkHighlightTarget(), checkHints(), checkText(), checkTokensAgainstAllowlist(), CLINICAL_DENYLIST (+11 more)

### Community 43 - "profile-check.mjs"
Cohesion: 0.12
Nodes (12): /src/templates/index.ts, /src/LocalProfile.ts, /src/templates/plan.ts, /tools/profile-browser.check.ts, args, CDP, chrome, originArg (+4 more)

### Community 44 - "telemetry.check.ts"
Cohesion: 0.05
Nodes (29): buildExport(), downloadJson(), DWELL_THRESHOLD_MS, dwellByObject(), DwellTotal, EventListener, ExportContext, ExportDocument (+21 more)

### Community 45 - "agent-review.check.ts"
Cohesion: 0.16
Nodes (11): assets(), ctx(), emptyPack, failures, fakeCtx, FakeImage, fakeLoad(), firewallWorld() (+3 more)

### Community 46 - "agent-provenance.check.ts"
Cohesion: 0.21
Nodes (7): computeProvenance(), ProvenanceBlock, buildAllowedTokens(), CaregiverInputs, words(), ctx(), failures

### Community 47 - "MemoryPack.ts"
Cohesion: 0.17
Nodes (11): CardStyle, fitToPlate(), injectAnchors(), Json, LoadOptions, loadPack(), MediaOptions, PackRejected (+3 more)

### Community 48 - "agent-provider.check.ts"
Cohesion: 0.13
Nodes (7): AuditEntry, AuditLog, AuditSink, consoleAuditSink, failures, REQUEST, WITH_IMAGE

### Community 49 - "Quality.ts"
Cohesion: 0.12
Nodes (15): AdaptiveOptions, AdaptiveResolution, AdaptiveStep, clampRatio(), detectQuality(), detectTier(), DeviceInfo, isSmall() (+7 more)

### Community 50 - "gemini.ts"
Cohesion: 0.20
Nodes (14): ALLOWED_HOSTS, classifyStatus(), classifyThrown(), friendlyMessage(), GeminiProviderAdapter, imagePart(), InteractionStep, isGoogleEndpoint() (+6 more)

### Community 52 - "loadMedia"
Cohesion: 0.20
Nodes (8): loadAudio(), loadImage(), loadMedia(), loadTexture(), PackMedia, placeholderTexture(), MediaResolver, mediaFor()

### Community 53 - "ReviewSession"
Cohesion: 0.30
Nodes (4): ReviewSession, ProposalReviewList, renderProvenanceSummary(), CaregiverInputRequest

### Community 54 - "selectProvider.ts"
Cohesion: 0.22
Nodes (10): DEFAULT_GEMINI_MODEL, GeminiConfig, LlamaCppConfig, LlamaCppProviderAdapter, ProviderAdapter, EMPTY_STUB_SCRIPT, NullProviderAdapter, SelectProviderOptions (+2 more)

### Community 55 - "EnvironmentEditor.ts"
Cohesion: 0.44
Nodes (8): needsSetup(), geminiConfigFromEnv(), receiveImage(), llamaCppConfigFromEnv(), selectProvider(), destinationLine(), environmentEditor(), waitingLine()

### Community 56 - "Q: How do uploaded images modify the game environment?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: How do uploaded images modify the game environment?, Source Nodes

### Community 57 - "proposals.fixtures.ts"
Cohesion: 0.33
Nodes (7): baseContext(), CAREGIVER_FIELDS, CAREGIVER_TEXTS, makeAssets(), makeWorld(), PROPOSAL_FIXTURES, sparseContext()

### Community 58 - "Proposal"
Cohesion: 0.33
Nodes (3): FirewallContext, ProposalFixture, Proposal

### Community 60 - "authoring.ts"
Cohesion: 0.26
Nodes (16): AuthoringRun, construct(), SkippedCall, dispatch(), ScriptedCall, ScriptedToolName, StubModel, nextProposalId() (+8 more)

### Community 61 - "validate"
Cohesion: 0.52
Nodes (4): isObject(), Problems, validate(), validateStep()

### Community 62 - "toProposals"
Cohesion: 0.33
Nodes (5): matchesType(), missingArgument(), runAuthoringPass(), toProposals(), resetProposalIds()

### Community 64 - "Rig"
Cohesion: 0.17
Nodes (5): Event, FakePlayer, FakeState, FakeVoices, Rig

### Community 66 - "agent.check.ts"
Cohesion: 0.12
Nodes (16): DEFAULT_AGENT_CONFIG, colors, describeEnvironment(), ENVIRONMENT_TOOL, validateEnvironment(), ENVIRONMENT_REASONING, ENVIRONMENT_SYSTEM_PROMPT, ProbeImage (+8 more)

### Community 70 - "State.ts"
Cohesion: 0.33
Nodes (5): GameState, MOVEMENT_ENABLED, POINTER_LOCK_WANTED, StateListener, TIMERS_RUN

## Knowledge Gaps
- **229 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+224 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 379 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `main.ts` to `pack.check.ts`, `agent.check.ts`, `World.ts`, `package.json`, `proceduralHouse.ts`, `Missions.ts`, `LocalProfile.ts`, `telemetry.check.ts`, `agent-review.check.ts`, `MemoryPack.ts`, `world.check.ts`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `boot()` connect `boot` to `MissionRunner`, `World.ts`, `proceduralHouse.ts`, `Player`, `Telemetry`, `State`, `Interaction`, `agent-gemini.check.ts`, `PackVoices`, `world.check.ts`, `main.ts`, `LocalProfile.ts`, `telemetry.check.ts`, `MemoryPack.ts`, `Quality.ts`, `loadMedia`, `EnvironmentEditor.ts`, `Renderer`, `validate`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `MissionRunner` connect `MissionRunner` to `Rig`, `pack.check.ts`, `HintBeacon`, `ChoiceCard`, `boot`, `Missions.ts`, `telemetry.check.ts`, `main.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `boot()` (e.g. with `.activate()` and `.clear()`) actually correct?**
  _`boot()` has 49 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _229 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pack.check.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1437908496732026 - nodes in this community are weakly interconnected._
- **Should `Three levels` be split into smaller, more focused modules?**
  _Cohesion score 0.0896551724137931 - nodes in this community are weakly interconnected._