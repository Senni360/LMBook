# Application cleanup and optimization — 0.3.5

The owner requested a whole-application cleanup and optimization. This change preserves the corrected 0.3.4 motion, saved word lists, source checks, draft recovery and desktop compatibility. Work started on September 14 and resumed on September 15, 2026, in an isolated worktree based on `02dc40f`; elapsed calendar time is not a claim about hours worked.

## Results

Measurements used authored fixtures and the production browser build on the same Windows computer. They describe these workloads, not a universal application speedup. Raw samples and outcomes are in [measurements.json](app-cleanup/measurements.json).

| Workload | Before | After | Interpretation |
|---|---:|---:|---|
| Chat input event to next animation frame, 20 citations against a 280,079-character source | 120.7 ms median | 8.8 ms median | 22 keystrokes per build; unchanged quote locations are reused during typing. |
| Validate 2,000 word entries and reviewed IDs | 11.65 ms median | 0.49 ms median | 12 timed iterations after warm-up, including fixture construction; identifier membership uses sets. |
| Assemble eight minutes of 44.1 kHz mono PCM | 84,672,044 bytes allocated by concatenation | 42,336,044 bytes | One full PCM copy removed. Output is byte-for-byte identical. |
| Same audio assembly, single timed observation | 22.34 ms | 10.52 ms | Supporting observation only; allocation and exact bytes are the stronger evidence. |
| Recurring status requests with 4.1-second responses | Maximum 2 overlapping | Maximum 1 | Next cycle starts 2.5 seconds after the complete previous cycle settles. |

The 150-card report was already inexpensive (roughly 0.2 ms); no meaningful pure-function speedup is claimed there. Memoization avoids repeating its work during unrelated edits. Studio reuses saved chapter word counts, quality warnings and credit estimates; saved-script edits still recalculate them. No educational effectiveness improvement was measured.

## Accepted changes

- Reuse citation locations, source-reader locations and saved Studio/flashcard analysis while their inputs remain unchanged.
- Remove one full PCM concatenation and redundant copies of owned speech buffers. Bound FFmpeg diagnostic storage with a byte counter instead of repeatedly joining it.
- Serialize the complete status → notebook → library refresh cycle, cancel work on disposal, and avoid publishing identical status objects. Keep the final refresh after a job disappears and the source-processing refresh trigger.
- Reject notebook refresh responses from an older selection or from before a successful edit returned through App's `change()` helper. Replace an obsolete generation-history request when a newer refresh is requested.
- Remove the unused hard-delete export, unused desktop download method, dead preview branch, dead trash parameter branch and obsolete flashcard animation. Consolidate three identical response-error helpers.
- Type the literal HTML word-list parser and parsed HTML nodes; validate the provider response fields actually consumed. Preserve literal-only import, source quotations and edit conflict/retry semantics.
- Remove 36 reviewed narration comments (41 lines), the obsolete design-process header among them. Replace the misleading `verifyHashes` option name with `requireWorker`; model hashing remains in the Python execution boundary. Remove the false blanket Windows rename claim while keeping its existing error fallback.

## Review and declined alternatives

[Coverage](app-cleanup/coverage.md) records frontend, backend, shared, desktop, Python and build-script inspection depth. Long modules received focused flow review; this is not a claim of exhaustive line-by-line review or execution of every path. Separate backend/frontend implementation reviews followed the edits. Two independent polling designs were compared and cross-judged before implementation.

The comment reviewer proposed 79 removals; only 36 were accepted. Provenance, public contracts, compatibility and asynchronous ordering explanations remain where they help maintainers. Broad draft-hook, storage, provider-RPC, retrieval and archive rewrites were declined: they introduce contract/invalidation risk without measured benefit. PDF page cleanup and lexical indexing remain profiling candidates, not diagnosed leaks or required fixes. Filtered word rows remain mounted because they own pending autosaves.

Review found two actionable gaps. The first provider schema validated unused OpenCode choices; it now validates the first consumed answer and allows unrelated later choices. A delayed same-notebook refresh could also replace a newer saved word on screen. That race was reproduced and fixed with a saved revision guard. The before/after word values are recorded in the measurements.

## Verification

- All 38 existing application tests pass, including real local FFmpeg conversion. TypeScript and production builds pass.
- Twenty WAV equivalence/error cases cover nonzero samples, one/multiple chunks, 24/44.1 kHz, extra metadata, extended format chunks, empty input and malformed/incompatible input. The eight-minute output SHA-256 remains `18ed4bd6bf99d1b79a88419a71bbbd234048be23c7cef425610e6b0e04e514d7`.
- Ten mocked provider responses, four literal-import cases and seven response-error cases pass. The mixed-extra-choice case is included. These are local diagnostics, not live provider trials.
- Isolated browser checks pass word autosave/reload, review invalidation, practice during incomplete review, both directions, strict wrong/correct typing, simulated standard-controller reveal/next, single-face answer concealment, exact citation highlighting, saved chapter-count recalculation, replacement history loading and A → B → A selection with a delayed response.
- The delayed final-job refresh now retains the newer saved word. Slow recurring requests no longer overlap. The source-processing predicate and teardown guards were also reviewed in source; a real OCR/transcription job was not run.
- The 390-pixel word-list view has no document-level horizontal overflow. Browser checks reported no page errors. Existing motion direction and answer visibility behavior remain intact.
- Windows installer and portable 0.3.5 packages were built. The actual packaged desktop smoke check passes private-backend isolation, renderer sandboxing, persistence and clean restart.

The owner deferred additional repository tests. One-off diagnostics and screenshots remain under ignored `.work/audit/`; the committed measurements preserve the reported outcomes. No paid generation, real owner-library writes, physical-controller trial or installation over the owner's running app was performed. The renderer is about 0.3 kB larger compressed; this is a responsiveness/allocation improvement, not a download-size reduction.

The [decision trail](app-cleanup-decisions.tsv) includes a correction for its initial placeholder timestamp. Subsequent rows explicitly record completed checkpoints retrospectively; they are not reconstructed exact action times. Final review and delivery outcomes are appended there.

## Final review

Reviewed by `gpt-5.6-sol`, a different available model from the implementing agent; no different-family model was configured. The review found no blocking defect. Attention: the saved revision guard covers mutations returned through `change()`, including the reproduced word-save race. It does not claim to solve every direct mutation/refresh or library-list ordering race. Browser observations have saved outcomes and screenshots but no committed replay runner; the review checked artifacts and the Git diff because a full transcript was unavailable. Workload-specific benchmarks and focused coverage retain the limits above.

Packaged integrity inspection matched 10 executable source/build files exactly, plus the retained application metadata and dependency fields in `package.json`. Electron Builder intentionally strips development-only package fields. SHA-256 checksums accompany the local installer and portable builds.
