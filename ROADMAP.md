# LMBook roadmap

- **Local Windows 0.3.14:** pre-0.4 audit fixes Trash/workspace identity, source-import capacity, omitted sync warnings and narrow-pane controls. [Release notes](docs/releases/0.3.14.md) and [tested workflows / remaining checks](docs/audits/0.4-release-readiness.md). Owner approval for 0.4 remains pending.

- **Local Windows 0.3.13:** unified notebook/Markdown-vault workspaces, three resizable panes, vault export, light/dark/system appearance and clearer local-model checks/indexing. [Release notes](docs/releases/0.3.13.md) and [behavior/evidence](docs/ui/unified-notebook-workspace.md). The 0.3.12 PR #9 is merged; these changes are a separate follow-up. Owner review and 0.4 approval remain pending.

- **Local Windows 0.3.12:** model-install progress, cancellation/retry recovery, concise Luna hardware advice and enforced delivery to the main checkout's normal release folder. [Release notes](docs/releases/0.3.12.md). This does not approve 0.4 publication.

- **AI setup and local vault search implemented in the 0.3.11 working preview.** Required Codex/OpenAI onboarding for fresh libraries, optional OpenRouter connection/model selection, hardware-informed local model setup and per-vault meaning search. The integrated CPU path indexed all 291 PWS notes without changing them. [Delivery evidence and remaining limits](docs/research/ai-integration-delivery.md). This is the model/provider foundation; the ten background workflows and their three edit-control modes remain pending. No 0.4 release approval is implied.

- **In progress: Obsidian workspace refinement.** The owner requested deeper navigation, reading/editing, direct new-notebook import, durable recovery and source review. Plugin-specific rendering is deferred. [Scope, decisions and acceptance journeys](docs/ui/obsidian-workspace.md); observations and remaining work are recorded in WORKLOG.md. This does not approve 0.4 publication.

- **Active milestone: 0.4.** The first shared-vault workflow is implemented as local preview 0.3.11: browse/edit/create shared Markdown, conflict recovery, selected-note snapshots and reviewed AI summaries. [Capabilities and remaining checks](docs/obsidian-vaults.md). Owner iteration, deeper compatibility and native Mac/real-vault checks remain; [release approval is unset](docs/0.4-plan.md).

- Version 0.3.10 corrects settings disclosure spacing and container styling. Obsidian support is in [feasibility discussion](docs/research/obsidian-feasibility.md), now adopted as the shared-vault direction for 0.4; implementation remains pending.

- Version 0.3.9 brings application-owned menus, desktop chrome, confirmations, media controls and supporting states into Ink. Implementation and visual/behavior evidence are in [the controls evaluation](docs/ui/ink-desktop-controls.md). Windows 0.3.9 is locally packaged and checked; native Mac evaluation and owner preference review remain separate.

- Version 0.3.8 adds native Apple Silicon and Intel Mac packaging, Finder tool discovery and Mac window/menu behavior. Native CI and release verification are part of [PR #8](https://github.com/Senni360/LMBook/pull/8); see [Mac setup](docs/macos.md).

- Version 0.3.7 refines Ink's shared hover, editing focus and heading-arrival rules, fits desktop chat to the window, and removes repetitive interface copy. Research, visual revisions, package checks and long-list performance limits are in [the interaction evaluation](docs/ui/ink-interactions.md). Local build complete; owner review remains next.

- Version 0.3.6 adopts the owner's Ink direction: individual pen contours across controls, restrained imperfections and underlines replacing bookmarks. See [the refinement and evaluation](docs/ui/ink.md).

- Version 0.3.5 completes the requested code cleanup and measured optimization sweep. It reduces repeated citation/episode work and audio copies, and fixes overlapping/stale refreshes. See [coverage, measurements and limits](docs/audits/app-cleanup.md).

- Version 0.3.4 adds the owner's requested application-wide purposeful motion sweep. Navigation, readers, evidence, editable lists, practice, playback, disclosures, dialogs and recovery use one motion system. See [coverage and verification](docs/ui/motion.md).

- LMBook is the owner's selected name from 2026-09-14. Version 0.3.3 rebrands the app and Windows downloads while preserving existing profiles and backup compatibility. See [upgrade behavior](docs/rebranding.md) and [release notes](docs/releases/0.3.3.md).

The owner authorized sustained, broad development on 2026-09-14, with Electron as the desktop delivery format. The existing journey is sources → learning goals → episode. The learning-experience workstream is investigating a purposeful questioning step before generation; its shape remains open to evidence and critical discussion. Deliver working vertical slices; check the evidence for completion before moving on. Follow [AGENTS.md](AGENTS.md) for the long-term quality and collaboration agreement.

## Learning-experience research — candidate reviewed, learner evaluation pending

- Flashcard modes and optional missing translations are implemented for 0.3.2: explicit words/concepts selection, agent-selected concepts, default-off generated translations with provenance, and usable drafts with visible source warnings. Evaluation and remaining fidelity limitations are in the [flashcard plan](docs/research/flashcards-plan.md).

- Flashcard follow-up: one editable word list with detected language labels, per-pair autosave and post-generation direction/typing controls. The owner explicitly allows practice while source review is incomplete; verification remains visible and edits invalidate it. See the current flow and evaluation in the [flashcard plan](docs/research/flashcards-plan.md).

- Flashcards are implemented in the 0.3.0 source build: Luna generation with custom prompts and source select/deselect all, HTML/TSV import, source-pair and human coverage review, attributed OCR corrections, single-face study, strict typing, direction-specific progress and backup/Trash integration. The owner's 148-pair reference and isolated Electron/browser/provider/lifecycle checks are recorded in the [flashcard plan](docs/research/flashcards-plan.md). Packaged desktop checks passed; see [release notes](docs/releases/0.3.0.md). Original-idioom comparison, larger model runs, physical controller use and learner evaluation remain pending.

- The first [focused research review](docs/research/learning-experience-findings.md) and [candidate conversation](docs/research/learner-interview.md) are complete. Primary evidence, counterevidence, four alternatives, and fourteen constructed failure cases support a candidate for rehearsal; they do not establish learning effectiveness. Follow [the research plan](docs/research/learning-experience-plan.md) for remaining work. The owner's ten-hour example was not a duration requirement.
- Rehearse the five required areas, targeted follow-ups, source/requirement distinctions, and shared brief with actual course material. Check annotated reading separately from requirements-based explanation. Confirm that brief reuse catches changed goals and sources. The candidate has not been run with learners or integrated into generation.
- Address economics method selection and numerical answers alongside conceptual explanation; evaluate optional visuals during walking/listening.
- Develop politics, history, and economics guidance after the learning decisions are supported. Keep biology open pending other learners' input.
- Needs, evidence, and scenario reviews are recorded; actual listening and outcome evaluation remain pending. Next: a real economics question with available answer guidance, followed by inspection of the original-word reading case with real text. Record negative cases and revisions. This workstream has not changed the current application flow.

## Desktop foundation — implemented, packaging checks continue

- Release 0.2.9 wraps up the current development sweep for publication to the private `Senni360/LMBook` GitHub repository. It includes the 0.2.8 features below plus v3 compact source backups, keyboard focus fixes and upload-size preflight. All 38 application tests and the packaged desktop smoke check pass. Small backups remain v2; v1/v2 restore remains supported. See [release highlights](docs/releases/0.2.9.md). Further product work waits for the owner's next direction.

- Desktop 0.2.8 is built under `release/0.2.8/`. The [no-generation sweep](docs/audits/2026-09-14-no-generation.md) adds recoverable Trash, shared-file-safe permanent deletion, streamed desktop downloads with visible errors/cancellation, cached library summaries and clearer import/refresh failures. All 35 existing application checks and packaged startup/sandbox/persistence/restart passed. Packaged UI checks passed Trash/restore/purge, shared historical source preservation, activity/draft cleanup, download success/failure/cancellation, empty-file handling and filter resets. It includes the previously verified 0.2.7 navigation, draft, playback and source-integrity fixes. The later compact backup work is included in 0.2.9.

- Completed the first T3 Code public-issue review and root follow-through in `docs/research/ui-reference-review.md`. Draft recovery, guarded navigation, specific script validation and reachable mobile editor actions were exercised. Continue the documented large-library and interrupted-operation checks when relevant; appearance is not being copied.

- Electron launches its own isolated backend and stores data in the user's application-data directory.
- Windows installer and portable build; no separate Node installation for ordinary use.
- Safe navigation, narrow desktop bridge, single instance, startup errors and graceful job cancellation on exit.
- Continue active work in the background when the user chooses; expose an obvious route to quit.
- Verify packaged startup, notebook persistence, imports, downloads and provider discovery.
- Preview 0.2.4 is built under `release/0.2.4/`. It adds native hidden Codex App Server startup, a connection check, visible planning progress/history and Cartesia streaming-WAV finalization. Real Codex outline/script generation, packaged Codex login and a short packaged two-host Cartesia preview passed. All 26 existing app checks and the desktop restart/persistence check pass. The owner's desktop library contains the ready houseplant demo; full audio generation and listening remain for the owner.
- Desktop 0.2.6 is built under `release/0.2.6/`. Cartesia defaults to native 44.1 kHz following the owner's matched-sample preference. Older episodes keep 24 kHz caches and original audio; selecting higher quality for a recorded episode creates a script copy. All 35 application tests and the packaged desktop smoke check passed. The packaged UI upgrade flow produced a real 8.4-second two-host preview at 44.1 kHz in an isolated library and preserved the original recording.

## Learning quality and generation

- Desktop 0.2.5 fixes outline failures caused by oversized chapter summaries: explicit output limits, one bounded repair request, goal-coverage revalidation and readable errors. A real Codex run against the owner's 38-goal notebook produced a valid 2,202-character chapter summary with every goal assigned. This checks outline structure, not whether five minutes can teach all 38 goals sufficiently.

- Implemented deterministic lexical passage selection for large source packs in English and Dutch, with exact source offsets, consulted-material disclosures and bounded cloud/Ollama request context.
- Implemented coverage batches of up to 12 objectives; missing evidence from a selected subset is reported as not established rather than as proof of absence.
- Implemented transcript corrections that retain original text and segment timing, clear stale word alignment, reject stale edits and survive ZIP restore.
- Ground every learning goal in inspectable passages; make missing evidence actionable.
- Preserve source snapshots across episode edits and exports.
- Measure script duration, repetition, coverage and unsupported claims before synthesis.
- Improve chapter revision and resume without regenerating already accepted work.
- Harness presets and versioned user instructions, independently adjustable depth and assumed knowledge.
- Continue improving large course packs without semantic search, synonym expansion or a claim of quality guarantee. Pending readable audio remains outside source context until it is transcribed.

## Active milestone: source originals and local transcription

- HTML and PowerPoint extraction with presentation order, page/slide markers and clear low-text warnings.
- Local printed-page OCR for PDF, PNG and JPEG using bundled Tesseract without Python, with text-layer-first PDF handling, optional all-page OCR, English/Dutch/bilingual language support, per-page cache, cancellation and retry.
- Retain original uploads by content hash; portable backups include originals and timestamped transcripts.
- Local faster-whisper setup, English/Dutch/automatic language, optional large-v3-turbo, CPU/GPU modes, cancellation and visible setup progress.
- Recording reader with timestamp jumps, machine-transcript caveats and links back to source evidence.
- OCR is for printed text. Diagram semantics and handwriting quality remain outside the supported guarantee.
- Consider Parakeet after the first transcript provider is verified against actual course recordings.
- Desktop 0.2.1 now includes the larger-source context and OCR changes. Packaged startup, PNG recognition, scanned and selectable PDF imports/recognition, saved recording readers, and an OCR/original ZIP round-trip passed in an isolated library. The Electron utility-process PDF worker/canvas path needed an explicit local configuration and is fixed.
- Live OpenCode large-request chat, coverage, planning and script checks passed against the current adapters. Repeat the full provider-to-speech journey in the packaged release once Google Cloud is configured; long-form listening quality and real course material remain unverified.

## Listening and portability

- Efficient whole-episode WAV and compact MP3 downloads.
- Persistent playback position, speed, chapter navigation and keyboard/media controls.
- Notebook backup/restore with audio and source provenance.
- Obsidian folder integration with explicit import/export behavior and conflict handling.
- A phone listening path with downloadable audio first; synchronization as a later opt-in capability.

## Connections and operations

- Automatic Windows releases are active for unpublished versions reaching `master`: locked install, existing tests, packaged desktop smoke, draft upload and checksum verification before publication. The first hosted run published [0.3.1](https://github.com/Senni360/LMBook/releases/tag/v0.3.1) successfully; 37 application checks and the packaged desktop check passed, with the optional FFmpeg check skipped on that runner. Version changes and release notes remain explicit in each release PR. Policy and retry behavior live in [the release guide](docs/releasing.md).

- Detect available local Codex, OpenCode and Ollama installations and explain actual readiness.
- Keep credentials on the host; allow provider setup without source-code edits.
- Google speech preview, usage estimates and clear billing boundaries.
- Cartesia Sonic 3.6 connection, voice search, two-host synthesis, previews, credit estimates and safe voice/quality changes implemented. Script/voice mapping, cached retries, exports and credential exclusion exercised with simulated provider responses; real account access and short packaged previews also passed. The owner's short-sample preference supports 44.1 kHz as the default. Broader pronunciation and long-form listening remain to be evaluated.
- Local speech feasibility is measured in `docs/research/local-tts-v3-experiment.md`: short Chatterbox calls fit the RTX 3060, longer calls fail fidelity checks, and exact sentence grouping improves the transcript comparison. Technical-term pronunciation, two stable hosts and listening quality remain open; a separate maintained-Piper control is underway. Keep production integration separate from this experiment and the other agent's cloud credentials work.
- Durable generation queue, retry/backoff and crash recovery with a visible activity history.
- Signed releases and update delivery when a publishing destination and signing identity exist.

## Research and educational breadth

- Supplemental source discovery with provenance, publication dates and user review.
- Strong subject defaults for politics, economics, biology, history, chemistry and physics.
- Optional recall exercises and exam-mode review after the listening workflow is dependable.
- Evaluation fixtures in Dutch and English that catch flattened qualifications and fabricated citations.

## Working constraints

The owner clarified on 2026-09-14: write no additional automated tests until they explicitly ask to wrap up the project. Build checks, manual app exercises and existing tests are permitted; defer test-suite expansion to the final sweep. Ask useful questions asynchronously and continue independent work, recording assumptions that can be revised after a reply.

Use bounded contributors; integrate and review their work. Prefer the user's OpenCode Go Muse Spark 1.3 Contributor for suitable tasks, Luna for isolated implementation, and Astra sparingly. Never claim real provider/audio validation when only mocks ran. Existing user data and credentials are not fixtures. Keep this roadmap and WORKLOG.md current across continuations.
