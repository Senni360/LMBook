# Cleanup review coverage

Review against base `02dc40f`. Coverage describes inspection depth, not proof that every path was executed. Final accepted changes, declined suggestions and behavior checks are in [the audit](../app-cleanup.md).

## Files Read and coverage inventory

`traced` means the relevant implementation was read; `sections` means entry points/selected bodies were read; `inventory` means filename/type only, not behavior proof.

| File | Coverage / disposition |
|---|---|
| electron/backend.cjs | traced; preserve utility-process launch/error signaling |
| electron/downloads.cjs | sections: transfer, cancellation, publication; unused hasActive surface |
| electron/icon.ico | inventory: binary branding asset, no backend change |
| electron/icon.png | inventory: binary branding asset, no backend change |
| electron/main.cjs | traced; preserve origin/profile/IPC/shutdown; status probe identified upstream |
| electron/preload.cjs | traced; narrow IPC surface and listener cleanup are appropriate |
| python/requirements-gpu.txt | read; pinned optional runtime, preserve |
| python/requirements.txt | read; pinned base runtime, preserve |
| python/transcribe.py | sections: model provenance, preparation, transcription, dispatch; preserve offline/hash guards |
| scripts/build-desktop.mjs | traced; simple bundling/copy, no change |
| scripts/release.mjs | sections: plan/stage and publication preflight; preserve version/tag/artifact safeguards |
| server/activity.ts | traced; history migration and bounded SQL updates are purposeful |
| server/artifact-lock.ts | traced; serializes publish/purge, preserve |
| server/audio-cache.ts | traced; preserve atomic writes, legacy fingerprint and quarantine behavior |
| server/audio-export.ts | traced stream/MP3, sections WAV parser; stderr accumulation finding |
| server/bundle-source-snapshots.ts | sections encode/hash and validation entry points; preserve version/hash format |
| server/cartesia.ts | sections credentials/HTTP/voice/synthesis/finalization; boundary schema already used |
| server/codex-app-server.ts | traced; RPC any cleanup candidate, preserve authorization and lifecycle |
| server/codex-command.ts | traced; native Windows launch and old-package fallback deliberate |
| server/context-selection.ts | sections scoring/chunking/selection; no semantics changes recommended |
| server/core.ts | traced JSON/WAV, sections evidence/export; WAV copy optimization |
| server/coverage.ts | traced; batching and verified quote handling preserve |
| server/document-import.ts | sections format dispatch/PDF/HTML and archive entry-point inventory; per-page cleanup candidate only |
| server/episode-revisions.ts | traced; copies editable script into independent artifacts, preserve |
| server/flashcard-routes.ts | sections startup/import/inline edits/review; typed edit branch cleanup |
| server/flashcards.ts | traced; literal parser/HTML types; preserve generation/translation behavior |
| server/index.ts | sections middleware/status/imports/notebook/export/generation routes/shutdown; unused import/status body |
| server/jobs.ts | traced audio/outline, sections script/job registry; Buffer copy optimization |
| server/notebook-bundle.ts | sections schemas/reference validation, export, archive collection and import entry-point inventory; preserve compatibility |
| server/notebook-trash.ts | traced; unreachable shared parameter branch |
| server/ocr-jobs.ts | traced; current-source checks and progress throttling preserve |
| server/ocr-worker.cjs | sections protocol/cache/assets/recognition/lifecycle; preserve integrity guards |
| server/ocr.ts | traced; worker settle/termination and result validation preserve |
| server/opencode.ts | traced; stream retry-part handling and isolated CLI preserve |
| server/preferences.ts | traced; optional return assertion is cosmetic, prioritize real findings |
| server/process-lifecycle.ts | traced; Windows descendants handling intentional |
| server/providers.ts | traced; parse external used response shapes instead of any |
| server/request-context.ts | traced; preserve complete-message history and bounded source context |
| server/source-originals.ts | traced; preserve content-addressed streaming and atomic publication |
| server/store.ts | traced summaries/trash/save, sections normalization; obsolete removeNotebook |
| server/transcript-corrections.ts | traced; removes invalid old word alignment and preserves original text |
| server/transcription-jobs.ts | traced; singleton local workload and progress throttling preserve |
| server/transcription.ts | sections subprocess/status/runtime/transcribe; misleading verifyHashes parameter |
| shared/context-summary.ts | traced; source scope schema preserve |
| shared/evidence-location.ts | sections exact/normalized location and helper inventory; preserve original offsets |
| shared/flashcards.ts | traced schemas/report/source checks; optional Set optimization |
| shared/model.ts | read model/settings/source/episode shapes; no teaching prompt changes |
| shared/ocr.ts | traced; result bounds/order preserve |
| shared/playback.ts | traced; storage failure tolerance and old keys intentional |
| shared/quality.ts | traced; advisory structural checks, no educational effectiveness claim |
| shared/script-editor.ts | traced; parser bound checks and attribution invalidation preserve |
| shared/speech.ts | traced; legacy sample-rate behavior preserve |
| shared/transcription.ts | traced; timestamped transcript schema and formatting preserve |

Additional existing tests read/referenced: `tests/core.test.ts`, `tests/jobs.test.ts`, `tests/cartesia-quality.test.ts`, `tests/audio-export.test.ts`. This pass did not run them; parent owns build/test and runtime verification.


## Files Read / Inventory disposition

All 21 frontend TS/TSX files were inspected for state/effects/data flow. Long files received focused flow reads rather than a line-by-line copy review. Stylesheets were inventoried and scanned for animation/layout/risky CSS, with focused rule reads; this was not a visual audit of every selector.

| File | Disposition |
|---|---|
| `src/main.tsx` | Main actionable costs/races above; retain existing page boundaries and navigation direction. |
| `src/desktop.d.ts` | IPC contract only; internal historical bridge name intentionally compatible. |
| `src/hooks/useDraftText.ts` | Read full persistence/acceptance flow; complexity protects actual concurrent-draft cases. Do not flatten blindly. |
| `src/hooks/useObjectDraft.ts` | Scalar patch abstraction fits its callers; current JSON parse cost is small relative to source/episode work. |
| `src/components/ActivityHistory.tsx` | Terminal-refresh race above; otherwise lazy load appropriate. |
| `src/components/CartesiaSetup.tsx` | Simple local connection task wrapper; error casts can narrow via instanceof as touched. |
| `src/components/ContextSummary.tsx` | Lazy first-open content, increments of 50 passages, source-hash checks should remain. Source map can memoize but low priority. |
| `src/components/Downloads.tsx` | Real IPC progress. Context object/start function are recreated on progress; stabilizing would avoid rerendering all DownloadLink consumers, a modest optimization. |
| `src/components/EpisodePlayer.tsx` | Existing persistence throttling, source restoration and native transport guards justified; no broad rewrite. |
| `src/components/Flashcards.tsx` | Canonical deck + views appropriate. Root separately measures validation costs. |
| `src/components/FlashcardStudy.tsx` | Single-face and ref-owned controller commands preserved. Fingerprint/initial serialization redoes work per input, but root owns flash/motion optimization. RAF controller loop polls absent pads; changing detection must preserve hot-plug behavior. |
| `src/components/FlashWordList.tsx` | Serialized autosave and retained hidden rows intentional. Root owns repeated evidence checks. |
| `src/components/GoogleSetup.tsx` | Copy-timer cleanup above; do not rewrite setup content within performance changes. |
| `src/components/LocalTranscriptionSetup.tsx` | Already single-flight status fetch and polling only while active; exact error-helper duplicate. |
| `src/components/Motion.tsx` | Current corrected direction confirmed; root owns layout/read/write benchmarking. |
| `src/components/NotebookTrash.tsx` | Load aborts on close/refresh, guarded mutations; profile/storage cleanup intentionally uses historical keys. |
| `src/components/SourceAudio.tsx` | Snapshot mode avoids transcription status fetch; timestamp focus and expectedText correction preserve source semantics; helper duplicate. |
| `src/components/SourceImage.tsx` | Image lazy-loaded on details open; no proposed optimization. |
| `src/components/SourceOcr.tsx` | Work polling delegated to App, no duplicate interval; helper duplicate. |
| `src/components/SourceSnapshotReader.tsx` | Preserves immutable episode/current fallback distinction; range checks are necessary. |
| `src/components/SpeechSettings.tsx` | 250ms debounce, AbortController and generation guard already prevent stale searches. Avoid generic rewrites. |
| `src/style.css` | Core theme/responsive styles; motion/reduced-motion scans. No broad deletion justified. |
| `src/motion.css` | Deliberate late overrides; remove only proved obsolete source rules. |
| `src/components/activity-history.css`, `cartesia.css`, `context-summary.css`, `downloads.css`, `episode-player.css`, `flashcards.css`, `google-setup.css`, `local-transcription-setup.css`, `notebook-trash.css`, `source-audio.css`, `source-image.css`, `source-ocr.css`, `source-snapshot-reader.css` | Inventoried/scanned; flash legacy rule identified, other animation selectors need runtime visual QA before alteration. |

Supporting implementations read: `shared/quality.ts`, `shared/evidence-location.ts`, relevant `shared/model.ts` types/helpers, `package.json`.

