# SenniBook roadmap

The owner authorized sustained, broad development on 2026-09-14, with Electron as the desktop delivery format. The existing journey is sources → learning goals → episode. The learning-experience workstream is investigating a purposeful questioning step before generation; its shape remains open to evidence and critical discussion. Deliver working vertical slices; check the evidence for completion before moving on. Follow [AGENTS.md](AGENTS.md) for the long-term quality and collaboration agreement.

## Learning-experience research — candidate reviewed, learner evaluation pending

- The first [focused research review](docs/research/learning-experience-findings.md) and [candidate conversation](docs/research/learner-interview.md) are complete. Primary evidence, counterevidence, four alternatives, and fourteen constructed failure cases support a candidate for rehearsal; they do not establish learning effectiveness. Follow [the research plan](docs/research/learning-experience-plan.md) for remaining work. The owner's ten-hour example was not a duration requirement.
- Rehearse the five required areas, targeted follow-ups, source/requirement distinctions, and shared brief with actual course material. Check annotated reading separately from requirements-based explanation. Confirm that brief reuse catches changed goals and sources. The candidate has not been run with learners or integrated into generation.
- Address economics method selection and numerical answers alongside conceptual explanation; evaluate optional visuals during walking/listening.
- Develop politics, history, and economics guidance after the learning decisions are supported. Keep biology open pending other learners' input.
- Needs, evidence, and scenario reviews are recorded; actual listening and outcome evaluation remain pending. Next: a real economics question with available answer guidance, followed by inspection of the original-word reading case with real text. Record negative cases and revisions. This workstream has not changed the current application flow.

## Desktop foundation — implemented, packaging checks continue

- Completed the first T3 Code public-issue review and root follow-through in `docs/research/ui-reference-review.md`. Draft recovery, guarded navigation, specific script validation and reachable mobile editor actions were exercised. Continue the documented large-library and interrupted-operation checks when relevant; appearance is not being copied.

- Electron launches its own isolated backend and stores data in the user's application-data directory.
- Windows installer and portable build; no separate Node installation for ordinary use.
- Safe navigation, narrow desktop bridge, single instance, startup errors and graceful job cancellation on exit.
- Continue active work in the background when the user chooses; expose an obvious route to quit.
- Verify packaged startup, notebook persistence, imports, downloads and provider discovery.
- Preview 0.2.2 is built under `release/0.2.2/`. Portable startup, printed PDF recognition and draft retention across a full process restart passed in an isolated library; a real packaged OpenCode chat returned verified source quotations. Full speech and long-form listening validation remain pending.

## Learning quality and generation

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

- Detect available local Codex, OpenCode and Ollama installations and explain actual readiness.
- Keep credentials on the host; allow provider setup without source-code edits.
- Google speech preview, usage estimates and clear billing boundaries.
- Local speech provider experiment after the primary cloud pipeline is verified.
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
