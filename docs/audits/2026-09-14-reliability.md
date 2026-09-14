# SenniBook reliability audit — 2026-09-14

Scope: bounded, read-only review of `server/jobs.ts`, `server/providers.ts`, `server/store.ts`, `server/index.ts`, `shared/model.ts`, `src/main.tsx`, and the existing tests. No real provider or speech calls were made. The findings below describe the current local-server implementation; Electron/bootstrap and the in-flight audio-export work were not reviewed.

The existing TypeScript/Vite build passed. The test command passed 10 unit tests; its integration test stopped at the server-readiness assertion (`tests/integration.test.ts:145`) before exercising the workflow, so the findings below are based on code paths rather than provider-backed validation.

## Ranked findings

### P0 — A script can become “ready” while omitting objectives and unsupported claims

Evidence: `server/jobs.ts:126-149` validates only that the model returned 2–100 turns and that both speakers occur. It filters unknown `sourceIds`, but it does not require a source ID on factual turns, verify that a chapter covers its assigned objectives, or compare the generated claims with the source text. `shared/model.ts:97` permits an empty `sourceIds` array. The UI then treats every chapter with turns as a complete script (`src/main.tsx:1272`, `src/main.tsx:1627-1635`), and the audio route accepts any chapter with turns (`server/index.ts:563-568`).

Reproduction: create a source that says “the capital is Paris” and an objective “explain the causes of inflation.” Return two valid turns, one per speaker, asserting unrelated facts and using `sourceIds: []`. The script job saves them, reports “Script ready,” and the audio action is enabled. A short voice preview or full episode can therefore turn ungrounded text into paid audio.

Action: add a server-side quality gate before setting the episode to `draft`: every assigned objective needs an explicit coverage result; source-backed claims need evidence tied to the episode snapshot; unsupported interpretation must be marked as such. Persist the gate result and block synthesis until the user accepts gaps. At minimum, reject chapters whose model output contains no source links when the brief requires source coverage.

### P1 — Full-episode downloads scale by materializing the entire episode in RAM

Evidence: `server/index.ts:593-600` reads every chapter WAV into an array, calls `combineWavs`, and sends one in-memory buffer. `server/jobs.ts:183-207` also accumulates all segment buffers for a chapter before writing it. A multi-hour episode can exceed available memory even when every chapter file is valid; the route has no size or streaming boundary.

Reproduction: generate enough chapter WAVs to represent a multi-hour episode, then request `/api/notebooks/:id/episodes/:eid/download`. The process must hold all chapter PCM, the concatenated PCM, and the response buffer at once. Under memory pressure the request fails or the server is killed, while the chapter downloads remain usable.

Action: stream an ordered WAV header and chapter PCM directly to the response, or stream through a non-shell audio muxer. Keep a bounded read buffer and add an integration test with many large fixture chapters. The same bounded approach should be used for any future MP3 export.

### P1 — A bad or stale audio cache makes resume fail indefinitely

Evidence: `server/jobs.ts:194-202` trusts any existing `${chapterId}/${segment}.wav`, calls `readWav`, and never removes or quarantines an invalid file. `server/index.ts:539-542` also blocks transcript editing merely because the chapter directory exists. Separately, `server/jobs.ts:175-177` skips a chapter solely when `audioFile` is set, and `server/index.ts:589-595` later reads that path without checking that the file still exists.

Reproduction A: stop the process during or immediately after a segment write, or truncate `data/audio/<chapter-id>/0.wav`, restart, and retry audio. The retry sees the file, `readWav` throws, and the same file is selected on every retry; editing is rejected because the directory exists. Reproduction B: after an episode is complete, remove one chapter WAV while leaving the SQLite row intact. The UI still offers a complete download; the download fails when `readFileSync` reaches the missing path.

Action: write segments to a temporary file and rename atomically; store a checksum plus script/voice/model fingerprint; validate cached files before reuse; quarantine and regenerate invalid or mismatched files. Before skipping a chapter or reporting completion, require the final file to exist and pass WAV validation.

### P1 — Episode snapshots are stored but are incomplete in Markdown exports

Evidence: `server/jobs.ts:86-101` stores `e.sources` and `e.objectives` snapshots when planning. Source deletion intentionally keeps episodes (`server/index.ts:337-344`). However, `server/core.ts:125-126` exports only the notebook’s current `n.objectives` and `n.sources`; it uses `e.sources` only to resolve a turn’s display title. The deleted source’s text and the deleted objective’s wording are absent from the portable export.

Reproduction: plan an episode from source S and objective O, then delete S and replace the objective list without deleting the episode. Export the notebook. The transcript may still name S through the episode snapshot, but the export has no S text and no O entry to explain the chapter’s goal. A Markdown backup can no longer reconstruct the evidence behind that episode.

Action: export each episode’s immutable source and objective snapshot under an episode-specific section, including IDs, titles, kinds, extracted text, and a source hash. Keep the current notebook section separate so later edits remain visible without erasing episode provenance.

### P1 — Process recovery is a marker, not a durable resumable job

Evidence: `server/jobs.ts:15-33` keeps job ownership, cancellation, and labels only in an in-memory `Map`. The episode model has only status/progress/error (`shared/model.ts:109-120`), and startup recovery (`server/store.ts:53-63`) changes `script`/`audio` to `error` without recording the active operation, chapter cursor, segment cursor, provider request, or retry count.

Reproduction: start a long script or audio job, terminate the server, and start it again. The job disappears from `/api/status`; the episode is marked as an interruption error. Completed chapters or cached segments can often be reused by manually pressing the action again, but there is no durable job history, automatic resume, lease, or explanation of the exact checkpoint. A crash between a file write and its metadata patch produces the cache inconsistency described above.

Action: add a small durable jobs/checkpoints table (episode, operation, chapter, segment, state, attempt, timestamps, error, provider/model fingerprint). Reconcile leases on startup, resume only verified checkpoints, and show retry/resume history in the existing job banner. Make shutdown cancel or checkpoint active work before the process exits.

### P1 — Target duration is a prompt hint, not a server-enforced contract

Evidence: `server/jobs.ts:64-70` computes chapter count and includes duration in the planning prompt. `server/jobs.ts:126-149` never checks the returned word count against `chapter.minutes`; the only limit is a per-turn character/turn-count schema. The UI displays the actual scripted estimate after generation (`src/main.tsx:1577-1582`), but synthesis is allowed as soon as every chapter has any turns (`src/main.tsx:1272`, `server/index.ts:563-568`).

Reproduction: request a 120-minute episode and have the provider return two short turns per chapter. The job reports a ready script and enables paid synthesis even though the resulting audio is far below the requested duration. The reverse case can create a much longer and more expensive episode than the target.

Action: calculate per-chapter and total words on the server, show a review state when they fall outside a documented tolerance, and require explicit acceptance before synthesis. Preserve the actual estimate in episode metadata so retries and exports use the same budget.

### P1 — Speech account configuration has no preflight or spend ceiling

Evidence: the UI enables audio when `status.googleProject` is merely non-empty (`src/main.tsx:1639-1654`), while the cost note explicitly says Cloud credits are not checked (`src/main.tsx:1465-1473`). `server/providers.ts:169-178` obtains ADC credentials and `server/providers.ts:183-219` sends each request, but there is no quota, billing, identity, or per-job budget check. `server/index.ts:141-146` reports only configuration presence.

Reproduction: configure a project string and ADC credentials whose project has no usable billing/permission, then start full audio for a long script. The app launches the job and discovers the account failure only when requests reach Google. The same path provides no app-level maximum to protect a user who accidentally starts a two-hour or repeated job.

Action: add an explicit per-job cost cap and estimated request count, require a confirmation for full generation, and run a short authenticated preflight before queuing all chapters. Keep tokens and keys server-side as today; expose only redacted readiness/account information and provider error categories.

### P2 — Deleting a notebook leaves all of its audio on disk

Evidence: `server/store.ts:33-35` deletes only the SQLite row. `server/index.ts:236-241` calls it without removing `audioDir` entries, and `server/jobs.ts:181-207` stores files by chapter ID outside the row. There is no reverse index or cleanup job.

Reproduction: create any episode with preview, chapter audio, or cached segments, delete the notebook, then inspect `data/audio`. The notebook disappears from the library while its audio and cache directories remain, consuming space and retaining user material.

Action: maintain an audio manifest per notebook and delete or move its files to a recoverable trash location as part of notebook deletion. Add a startup orphan scan with a visible reclaim action, and include the audio files in backup/restore rather than treating Markdown as a complete backup.

### P2 — Uploaded-source provenance stops at extracted text

Evidence: `server/index.ts:321-329` persists the filename and extracted text, while `shared/model.ts:75-82` has no content hash, parser version, original-byte reference, or revision field. The product explicitly discards original binaries after extraction. This makes a later export unable to prove which PDF/DOCX bytes produced the snapshot, and a parser upgrade can produce a different text for the same file.

Reproduction: import a PDF, delete the original file, and export or restore the notebook elsewhere. The app can preserve the extracted text but cannot verify the original document, its checksum, or the extraction settings.

Action: store a SHA-256 and extraction metadata at import; optionally retain the original file in a notebook attachment directory. Put the hash and snapshot metadata in episode exports so source-to-goal-to-audio provenance remains auditable.

## Three next capabilities with high reliability value and low UI cost

1. **Durable generation queue with verified checkpoints.** Keep the current job banner, add a persisted operation record and a compact “Resume / retry” action. This covers crash recovery, cancellation, retry counts, and multi-hour progress without adding another primary navigation area.

2. **Source-to-goal evidence ledger and script quality gate.** Reuse the existing Sources, Learning goals, and chapter views to show objective coverage, missing evidence, and turn-level citations. Gate audio on an explicit review result rather than adding a new workflow screen.

3. **Portable notebook bundle backup/restore.** Export a versioned manifest containing current data, episode snapshots, source hashes, and audio files, then restore it with conflict-safe IDs. This gives the source → goals → audio chain a recoverable boundary and resolves the current Markdown-only and orphan-file risks.
