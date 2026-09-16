# Obsidian refinement integrity review

16 September 2026. This is a read-only review of the current refinement snapshot in `.work/lmbook-custom-ui`. I inspected `server/vault-index.ts`, `server/vault-routes.ts`, `server/vault.ts`, `server/vault-learning.ts`, `src/components/VaultWorkspace.tsx`, `src/components/vault/vault-drafts.ts`, `VaultNavigator.tsx`, `VaultLearningPanel.tsx`, `VaultMarkdown.tsx`, and the shared vault/index/learning types. The recovery and index routes are present in this snapshot; I did not treat the earlier transient route gap as a finding. No code or tests were changed, and I did not run a live Obsidian or sync-provider session.

The refinement has several good boundaries: the index keeps note bodies out of the renderer, normal import sends reviewed revisions, refresh preserves historical episode/flashcard snapshots, the Markdown renderer skips raw HTML and blocks remote images, recovery writes are debounced and serialized per vault/path, and notebook mutation is guarded by the artifact lock. The findings below are the cases where those protections do not yet compose safely.

## Priority findings

### P0 — Index purge can be undone by the cancelled task

`DELETE /api/vaults/:vaultId/storage` calls `stopVaultIndex(id)` and immediately calls `purgeVaultStorage` (`server/vault-routes.ts:78-80`). `stopVaultIndex` only sets `state.cancelled = true` and removes the state from the map (`server/vault-index.ts:123-126`); it does not await the in-flight `rebuild` promise. The rebuild writes each note in its own SQLite transaction (`server/vault-index.ts:34-44, 66-98`). A note read or `yieldTurn()` already in progress can finish after the purge and repopulate `vault_index_notes` and `vault_index_search`.

Reproduction:

1. Connect a vault with enough notes that indexing remains active.
2. Start `POST /index`.
3. While a note is being read or between two `saveMetadata` calls, issue `DELETE /storage` with `{ "category": "index" }`.
4. The delete can return success and the storage screen can show zero index bytes. The cancelled task then resumes its current iteration or a pending transaction and writes rows after the delete.
5. `VaultWorkspace` calls `loadIndex` after the delete (`src/components/VaultWorkspace.tsx:262-265`), which can start a second rebuild while the old task still has access to the same tables.

This can leave a mixed index, make a supposedly cleared index reappear, and let a late old task overwrite rows from the new rebuild. Disconnect has the same shape: the route stops the index and returns without waiting (`server/vault-routes.ts:111-117`).

The practical fix does not need a universal filesystem CAS. Make index ownership awaitable: `stopVaultIndex` should mark cancellation and return the task promise; the purge route should await it before deleting rows. Give each rebuild a generation token and make every write check that token immediately before its transaction. A second `getVaultIndex` must not start until the old promise has settled. On cancellation, clear or roll back only the cancelled generation and leave the last complete generation available. The stronger alternative is staging tables keyed by `index_generation`, followed by one promotion transaction; cancellation drops staging rows and cannot touch the promoted index. A single global artifact lock would serialize purge and index writes, but holding it over the whole scan would block note saves and is a poorer tradeoff.

Acceptance evidence: start indexing, cancel at several points, purge, wait longer than the old scan, then inspect both inventory and raw index row counts. They must remain zero until a new explicit rebuild completes. Repeat purge during an active disconnect and after immediately reconnecting the same vault.

### P0 — Normal index reuse can return stale content when mtime and size are unchanged

The cached-note fast path reuses `old` when only `old.modified === file.modified && old.bytes === file.bytes` (`server/vault-index.ts:69-78`). The index does not compare a content hash or the `VaultNote.revision` on that path. A note can change while preserving its byte length and modification timestamp. Sync tools can also copy content while retaining timestamps, and some filesystems expose coarse timestamp precision.

Reproduction: index `Note.md`, replace `alpha` with `bravo` using the same byte length, restore or preserve its mtime, then request a normal `GET /index` after the 30-second refresh interval. The index reports the old title/body/search snippet. `VaultMarkdown` may show the current file while search and backlinks still describe the previous text.

The smallest safe alternative is to treat mtime/size as a hint only: for cached candidates, read and hash the bytes before reuse, or compare a stored revision from a bounded read. That costs more I/O but preserves correctness. A watcher can trigger incremental reindexing and reduce latency, but it cannot replace periodic content verification because watcher events can be missed on cloud/removable volumes. Keeping the current fast path is acceptable only if the UI labels search as advisory and a forced “verify current bytes” action is available; it is insufficient for source selection or citation navigation by itself.

Acceptance evidence: same-size/same-mtime edits, edits through Obsidian, and edits arriving through a sync fixture must update full-text results, headings, aliases, tags, and backlinks after the next ordinary refresh. A forced refresh must never reuse a row on mtime/size alone.

### P1 — Search and context expose a mixed generation while indexing runs

`rebuild` replaces the in-memory file inventory with the newly scanned files before individual notes are indexed (`server/vault-index.ts:56-58`). It then deletes missing rows and updates FTS rows one file at a time (`server/vault-index.ts:59-91`). During that interval:

- `searchVault` reads the new in-memory filename/alias/tag list and the old/new mixture in `vault_index_search` (`server/vault-index.ts:128-144`);
- `vaultNoteContext` reads all currently stored metadata rows, which can be a mixture of generations (`server/vault-index.ts:147-164`);
- the UI continues to allow opening and selecting search results while `index.status.running` is true (`VaultWorkspace.tsx:160-181, 275-277`).

Reproduction: change or delete a note, start a forced index rebuild, and search before completion. A result can show a new filename with an old snippet, or a backlink can disappear and reappear as rows are processed. Selecting that result for learning can then read the live file while the displayed context came from another revision.

Prefer a read-model generation boundary. Build metadata and FTS rows under a new generation ID, keep the last complete generation queryable while the new one runs, and atomically promote the generation only after all rows and inventory state are complete. If staging tables are too large a change for this iteration, the minimum is to return `status.running` and a generation ID with every search/context response, and have the UI disable source selection from search results until the generation is complete. Do not delete the old rows before the new generation can be promoted.

Acceptance evidence: during a long rebuild, every search result and context response must identify one generation and be internally consistent. After cancellation, the old complete generation remains usable; after success, all consumers switch together.

### P1 — Asset reads still have a filesystem check-to-open race, and `readFile` is not bounded against growth

The new generic asset route validates a path and rejects symlinks through `checkedVaultPath`, then opens the returned string path (`server/vault.ts:161-174`). The validation and `open` are separate operations. A process or sync client that can modify the vault can replace the checked image with a symlink/junction before `open`; the open can follow it and return bytes outside the vault. The same time-of-check/time-of-use shape remains for notes, but the asset route broadens it to every supported image path.

The size check also happens before `handle.readFile`, with a second check only after the whole file is in memory (`server/vault.ts:167-172`). If the file grows after `stat`, the process can allocate substantially more than the 16 MB policy before it discovers the violation.

Reproduction: create a valid `image.png`, request it repeatedly, and have a second process replace it with a junction/symlink or grow it during the request. The route can return outside bytes or allocate the grown file. This is mainly a same-machine threat-model issue, but shared cloud folders and removable drives make accidental races plausible too.

Use an opened handle as the authority: open with no-follow/reparse-point protection where the platform provides it, stat the handle, read in bounded chunks, and reject once the byte limit is exceeded. Re-check the final handle identity where native support is unavailable. Keep the current extension allowlist and CSP. Do not rely on a second path-based `lstat` as a universal guarantee; it only narrows the race.

Acceptance evidence: symlink/junction fixtures, a file replaced during the request, and a file that grows past 16 MB must produce a clear rejection and no outside bytes. A valid image at or below the limit must render and remain confined to the selected root.

### P1 — Source refresh can publish a snapshot that is stale by the time the operation succeeds

The refresh path correctly checks the reviewed revision while loading each source and rechecks that the notebook source has not been changed by another LMBook operation (`server/vault-learning.ts:481-519`). It does not re-read or re-hash the live vault file after `loadNote` and before committing the refreshed source. The attachment hash proves that the stored snapshot matches the bytes read by LMBook; it does not prove that those bytes are still the bytes on disk when `saveNotebook` runs.

Reproduction:

1. Run source-change inspection and select a changed source.
2. Start refresh.
3. After `loadNote` returns but before `storeOriginal`/the final notebook save, edit the same note in Obsidian or let Sync replace it.
4. LMBook saves the first read as the new current source and reports `refreshed`, even though the live file now has another revision.

This is a freshness/reporting bug, not corruption of the immutable snapshot. The user may immediately generate from a source they believe is current while it is already stale.

Practical choices:

- The strongest local solution is a second bounded read/hash immediately before notebook commit; if its revision differs, abort with 409 and leave the notebook unchanged.
- A cooperative lock file can reduce simultaneous editor writes but cannot control Obsidian or a cloud service and should not be presented as CAS.
- A filesystem watcher can mark the result “changed during refresh” but cannot guarantee that no write occurs after the watcher event.
- If the product accepts snapshot-at-read semantics, return `capturedRevision`, `capturedAt`, and a post-save drift warning rather than claiming a current refresh.

The first option is the best release behavior. It does not require an impossible universal transaction with Obsidian; it simply refuses to call a known stale read current.

Acceptance evidence: mutate the file before load, between load and attachment publication, and immediately after commit. The first two must reject or explicitly report drift; the last is an unavoidable subsequent change and must appear on the next inspection.

### P1 — `javascript:` and other active schemes are treated as ordinary external links

`isExternal` accepts any URI scheme (`shared/vault-markdown.ts:191-194`), and `ResolvedLink` sends the raw URL to an anchor with `target="_blank"` (`VaultMarkdown.tsx:187-196`). `rel="noreferrer"` does not make `javascript:` safe. A note containing `[run](javascript:...)` can execute script in the Electron renderer when clicked. `data:`, `file:`, and custom application schemes also need an explicit policy. The renderer has a preload bridge and local application state, so this is a privacy and integrity boundary rather than a cosmetic link issue.

Reproduction: put `[open](javascript:document.body.dataset.pwned='1')` in a Markdown note, open it in Read mode, and click the link. The current external-link branch can navigate to the scheme instead of treating it as unsupported text.

Allow only schemes with an intentional external-open policy, normally `https:` and `http:` (and a separately handled `mailto:` if wanted). Render all other schemes as blocked text with a clear reason. Keep raw HTML skipped as it is today. Add acceptance cases for `javascript:`, `data:`, `file:`, `obsidian:`, and percent-encoded variants.

### P1 — Recovery durability is improved, but page lifecycle flushing is still best effort

The new `VaultDraftStore` debounces writes at 350 ms and serializes operations by key. `flush` uses `Promise.allSettled` and is called from `blur`, `pagehide`, and `visibilitychange` (`src/components/vault/vault-drafts.ts:132-174, 336-363`). `pagehide` cannot keep an Electron renderer alive until an asynchronous fetch completes. `beforeunload` blocks ordinary navigation when pending, but it cannot protect a process kill, crash, power loss, or an OS update (`VaultWorkspace.tsx:134-139`).

Reproduction: type into a new note, terminate the Electron renderer/process during the 350 ms debounce or while the pagehide fetch is in flight, then reopen the vault. The server has no recovery row yet, so the draft is gone. This is an expected residual window for any network-backed debounce, but the current status text can imply “Keeping draft…” before the server has acknowledged it.

Keep the server as the authority, but make the state honest: distinguish `queued`, `writing`, `saved at`, and `failed`; show the last acknowledged version/time; and leave a process-local or OS-backed emergency copy for the short unacknowledged window if the product promises crash recovery. A synchronous `localStorage` fallback would restore durability at the cost of the previous main-thread/quota problem, so it is not the preferred permanent store. At minimum, an explicit Save or leaving the note after a failed flush must remain blocked until the user saves/copies it, and acceptance should include forced termination during debounce and during request completion.

### P2 — Imported/refresh attachments can become unreferenced after notebook persistence fails

`importVaultLearning` and `refreshVaultSources` write content-addressed originals before `saveNotebook` (`server/vault-learning.ts:328-360, 497-548`). If storage runs out of space, SQLite is locked, the notebook write fails, or the process exits after `storeOriginal` succeeds, the hash file remains with no notebook reference. This does not corrupt a source, but it grows the originals store and makes lifecycle inventory inaccurate unless existing garbage collection later finds it.

Reproduction: make `saveNotebook` fail after one or more `storeOriginal` calls, then inspect `data/originals`. The operation reports an error, but the newly written immutable file remains.

The practical choices are to write an import manifest before originals and reconcile/commit it, or to run a post-failure content-addressed sweep that deletes only hashes unreferenced by active, trashed, and historical notebooks. Do not delete on every failure without checking references: another notebook may already use the same hash. Acceptance should force a notebook-write failure and verify that the next reconciliation removes only the orphan.

### P2 — Selected paths survive index refresh even when the note was deleted or renamed

Selection is stored in per-vault preferences and `loadIndex` replaces the index without pruning selected paths (`VaultWorkspace.tsx:27-38, 125-128, 153-159`). The learning panel therefore continues to show a deleted/renamed path. Normal reviewed import eventually reports an issue because `previewVaultLearning` catches the read failure, so this is currently a confusing and recoverable failure rather than silent source loss.

Reproduction: select a note, delete or rename it in Obsidian, refresh/index the vault, and open Learn. The deleted path remains selected and is sent in the next preview request.

After each completed index generation, reconcile selection against the current file set and mark missing paths until the user removes or reselects them. Preserve the path in the review result so the user can understand what happened, but do not let “selected” look ready. The same reconciliation should cover favorites, recent tabs, and the active path; the editor already has a separate `missing` warning and recovery path.

### P2 — Normal save still has the practical compare/rename race

The existing-file save checks the current revision, then renames the temporary file over the target (`server/vault.ts:383-391`). An external writer can publish between the final `readVaultNote` and `rename`. The UI's polling and the server's revision checks catch ordinary conflicts, but neither can prove that no external write occurred in this final window.

There are three realistic policies:

1. Keep the current atomic same-directory rename for ordinary saves, add a post-save revision check and a cooperative lock/“Obsidian may be editing this file” notice. This reduces the window and detects subsequent divergence, but cannot recover a write already overwritten in the last micro-window.
2. Use platform-specific handle/file-ID operations where available to narrow replacement races. This improves Windows/POSIX behavior but still cannot coordinate every sync provider and should be treated as an optimization.
3. On an observed conflict, offer explicit `keep vault`, `keep my draft`, and `save both`; do not silently create a copy for every normal save. The user explicitly wants shared editing, so a save-both copy belongs to the conflict flow, not the default path.

The current implementation is reasonable as a best-effort shared-file save if the residual race is documented and acceptance covers it. It should not claim universal compare-and-swap. A deterministic way to test the boundary is to pause an external writer between LMBook's final read and rename and verify that the UI reports whatever can be detected, while recording the unavoidable residual limitation.

## Lower-risk observations

- Folder creation is correctly constrained to the selected root and existing parent folders (`server/vault.ts:81-155`). The `mkdir` operation is still a race with another creator, but `EEXIST` is a clear retry/error path and does not overwrite an existing folder.
- Generic asset enumeration intentionally includes non-Markdown regular files, while preview only serves a fixed image extension allowlist (`server/vault.ts:157-174, 197-220`). Keep unsupported files visible as attachments rather than attempting to parse or upload them.
- `VaultMarkdown` uses `skipHtml` and maps local image embeds through the checked asset route (`VaultMarkdown.tsx:297-313, 562-574`). The active-scheme issue above is the remaining preview security gap.
- `saveMetadata` uses a transaction per note, which prevents a single note's metadata and FTS row from being half-written. It does not provide a whole-index generation boundary, so it cannot solve the P0/P1 cancellation/mixed-generation findings by itself.
- `importVaultLearning` stores the exact bytes read and verifies the content-addressed attachment hash (`server/vault-learning.ts:105-125, 328-338`). The remaining timing issue is whether those exact bytes are still current when the operation is reported as a refresh.

## Prioritized acceptance workflows

### Index cancellation and purge

Create a disposable vault with enough notes to keep indexing active. Start a forced rebuild, cancel through index purge at the beginning, during a note read, between note transactions, and during final inventory persistence. Wait for the original task to settle, inspect storage counts, search, context, and the UI status, then start a fresh rebuild. The old task must not repopulate a purged index, and no search response may mix generations.

### Same-size content change

Index a note, replace its contents with same-length text while preserving mtime where the filesystem permits, and trigger an ordinary refresh. Search, title, tags, outline, backlinks, and preview must converge on one revision. Repeat through Obsidian and a sync-folder fixture.

### Refresh timing

Inspect source changes, mutate the live note before loading, during `storeOriginal`, immediately before notebook commit, and immediately after commit. The first three outcomes must either abort with a clear drift response or explicitly identify the captured revision as stale. Episode/flashcard historical snapshots must remain unchanged in every case.

### Filesystem paths and assets

Exercise root and nested folder creation, duplicate folder creation, invalid names, junctions/symlinks, a valid image, an unsupported asset, an image at 16 MB, an image that grows during read, and an image replaced by a link during read. Verify no outside bytes are returned and no partial or oversized allocation is treated as a successful preview.

### Recovery and UI races

Type during the recovery debounce, blur, background, close, force-terminate, and restart. Verify the last acknowledged status is visible and an unacknowledged draft is either recovered by the emergency mechanism or clearly blocked from being discarded. Delete/rename a selected note and refresh; verify it is marked stale before learning import. Start a recovery write, then save the vault note, edit again, and force a late delete/write response; the newer draft must survive and the UI must surface a CAS conflict rather than silently removing it.

### Markdown link policy

Preview notes containing `javascript:`, `data:`, `file:`, `obsidian:`, `http:`, and `https:` links, raw HTML, local images, remote images, and plugin blocks. Only the explicitly allowed external schemes should open. Remote media and unsupported plugin output should remain blocked or clearly labelled, while source bytes stay unchanged.

## Release order

1. Make index stop/purge awaitable and generation-safe. This is the only direct path in the current refinement that can undo an explicit destructive purge after it reports success.
2. Remove mtime/size-only index reuse and add an index generation boundary or an equivalent consistent-read rule.
3. Add post-read freshness detection to refresh and make its result describe the captured revision.
4. Close active URI schemes and bounded asset reads before treating the rendered preview as a trusted desktop surface.
5. Clarify recovery acknowledgement and run forced-termination workflows; then clean orphan content-addressed originals.
6. Reconcile selected paths after each index generation and document the residual compare/rename race with explicit conflict actions.

These are bounded changes to the current architecture. They preserve shared-file editing and do not require claiming an impossible transaction across LMBook, Obsidian, and cloud sync.
