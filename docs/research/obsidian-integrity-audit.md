# Obsidian shared-vault integrity audit

16 September 2026. This is a static engineering review of the local 0.3.11 shared-vault preview in `.work/lmbook-custom-ui`, with the next requested expansion in mind: full-text navigation, note read/preview, notebook creation/import, and source refresh. I read the worktree's `AGENTS.md`, `PRODUCT.md`, `ROADMAP.md`, `WORKLOG.md`, `docs/obsidian-vaults.md`, `server/vault.ts`, `server/vault-routes.ts`, `shared/vault.ts`, and `src/components/VaultWorkspace.tsx`. I did not change the implementation or add tests, and I did not run a real Obsidian/Sync session. Findings below are code-review findings unless marked as an open validation question.

The current preview already has meaningful protection: selected folders are canonicalized, hidden and linked entries are excluded from scans, note paths are constrained, source snapshots retain raw bytes, edits use revision hashes and recovery history, generated summaries remain drafts until reviewed, and the UI does not automatically merge prose. Those safeguards are worth preserving. They do not yet make the shared folder a transactional database, and the next features would make that distinction more consequential.

## Release recommendation

Keep 0.4 behind the existing publication gate until the following four contracts are explicit and exercised with a disposable copy of a real vault:

1. A write either publishes the exact submitted bytes, or leaves the existing file untouched and leaves an inspectable draft/copy. A best-effort overwrite is not an acceptable conflict resolution policy.
2. Every imported source identifies the vault identity, relative path, raw-byte revision, and import time. Refresh is an explicit operation that creates a new immutable snapshot and links it to the prior snapshot; it never silently rewrites an existing learning source.
3. Search and preview are a read model with bounded work. Indexing can be stale or incomplete with a visible status, but it must not block editing, upload a vault implicitly, or require loading every note into the renderer.
4. Recovery, history, drafts, and generated source snapshots have a visible retention and purge policy. Disconnecting a vault must not be the only lifecycle operation available for data that may contain private notes.

The strongest blockers are the first two. The current implementation itself acknowledges the compare/rename race (`docs/obsidian-vaults.md:21`), and the source import route has no durable origin identity beyond a display path (`server/vault-routes.ts:178-221`).

## Findings

### P0 — Source identity cannot safely support refresh or multiple vaults

`POST /api/vaults/:vaultId/sources` deduplicates a snapshot by `title === path` and `originalSha256` (`server/vault-routes.ts:211-217`). The vault ID is not part of that key, and the saved source object has no structured vault origin (`shared` source types are elsewhere in the existing notebook model; the route only writes `filename`, `title`, hashes, and a free-text `extraction`).

Counterexample: two connected vaults both contain `notes/intro.md` with the same bytes. Importing the second file into one notebook reports it as an identical existing snapshot and skips it, even though the two files have different origins and may later diverge. Conversely, changing or renaming a file creates an unrelated source record rather than a refresh lineage. A learner cannot reliably answer “which vault revision did this episode use?” or refresh only the stale source.

Required model:

```text
sourceOrigin = {
  vaultId,                 // local registry identity
  rootIdentity,            // stable identity recorded at connection time
  relativePath,
  revision,                // SHA-256 of exact source bytes
  importedAt,
  displayPath              // presentation only
}
```

Use `(rootIdentity, normalizedRelativePath, revision)` for idempotent import. Keep the prior source snapshot and add a new one when the revision changes. If the same path is deleted, renamed, or moved, report that state and require a user choice; do not infer a rename from matching text. A refresh result should say `unchanged`, `updated`, `missing`, `moved/unknown`, or `rejected`, with old and new revisions available to the learner. Root identity must handle a reconnect after a path change without confusing a different folder that happens to have the same name; when that cannot be proven, ask for explicit reattachment.

### P0 — Edit publication has a last-moment overwrite race

For an existing note, `saveVaultNote` checks the submitted revision and then calls `rename(temporary, target)` (`server/vault.ts:335-342`). An external editor or a sync client can write between the final `readVaultNote` and `rename`. The newer external bytes are then replaced without another conflict response. `withArtifactMutation` only serializes LMBook's own backend calls; it cannot coordinate Obsidian, iCloud, OneDrive, Dropbox, or another LMBook process (`server/artifact-lock.ts:1-21`). The implementation notes this limitation, but it is a data-loss boundary rather than a minor caveat.

Counterexample: Obsidian saves a changed note during the small interval after LMBook's revision check. LMBook renames its temp file over the target and returns success. The sync service then uploads LMBook's older draft. The UI has no conflict to show because the overwrite already succeeded.

Recommended publication protocol, in descending strength:

- On supported local filesystems, publish through a handle or platform primitive that can compare the file identity and revision at replacement time. If the platform cannot provide compare-and-swap, treat the final replacement as uncertain and preserve a conflict copy instead of claiming a clean save.
- Keep a sidecar or recovery record containing expected revision, submitted revision, resulting revision, and write timestamp. Re-read after publication; if the observed bytes do not equal the submitted bytes, surface “changed during save” and retain both versions.
- Use a clearly named temporary file in the same directory, flush file and directory metadata where available, and define what a sync service may observe. Do not rely on hard-link support as the normal atomicity mechanism; the fallback currently opens the target and writes directly (`server/vault.ts:309-332`), so a disk or process failure can expose a partial new note.
- If an external change is detected, offer `keep vault`, `keep my draft`, `save both`, and a deliberate merge workspace. Never overwrite a changed note merely because the path still exists.

This does not require pretending that arbitrary sync providers offer transactions. It requires the UI to describe an uncertain publication as a conflict and preserve recoverable bytes.

### P1 — Recovery and generated-draft storage has no bounded lifecycle

Every save can add full note bytes to `vault_history` (`server/vault.ts:224-229, 261-272`), and every generated summary is stored as an entire JSON body in `vault_generations` (`server/vault.ts:350-371`). The UI shows only the newest 30 history entries, but there is no age, byte, count, or purge policy. Disconnect keeps the data locally (`server/vault.ts:74-78` and `docs/obsidian-vaults.md:24`), while the UI has no route to inspect or remove old recovery copies. A private vault can therefore remain in the LMBook database after the user believes it was disconnected, and repeated large-note saves can grow the application database without bound.

Counterexample: a 900 KB note is edited and saved daily for a year. The hidden history can approach hundreds of megabytes even though the UI exposes 30 entries. A shared computer backup now contains years of private note text. The same issue applies to summary drafts, whose source snapshots and generated Markdown are returned in full by the paginated drafts endpoint (`server/vault.ts:355-363`).

Define retention before expanding usage:

- show storage usage per vault for history, local recovery, drafts, and imported snapshots;
- retain a bounded number/size by default, with an explicit “keep forever” or export action for a selected revision;
- provide `delete recovery history`, `delete generated drafts`, and `forget disconnected vault` as separate, destructive, confirmed actions;
- make notebook backup/restore state exactly what it includes; the current ZIP boundary excludes live vault, connection registry, editor recovery, and summary-draft history (`docs/obsidian-vaults.md:24`);
- consider OS-protected or encrypted-at-rest storage for recovery copies and an in-app privacy disclosure before the first AI submission.

Do not silently purge the only copy of an unfinished draft. Purge should report the exact categories and byte counts removed.

### P1 — Browser storage is not durable enough for a 1 MB editor

`remember` serializes the entire editor, including the base note and current text, into `localStorage` on every keystroke (`VaultWorkspace.tsx:167-181, 202-207`). For a near-limit note this can write roughly two large copies synchronously on the renderer's main thread. Multiple drafts can hit browser quota. When storage fails, the fallback is an in-memory map and `beforeunload` blocks ordinary navigation, but a crash, process kill, power loss, or renderer restart can still lose it (`VaultWorkspace.tsx:137-146, 183-189`).

Counterexample: a 950 KB note is opened, edited repeatedly, and then LMBook is killed by an update or OS shutdown while `localStorage` has exhausted its quota. The current process had the draft in memory, but the next process cannot recover it. The user sees a warning only if the synchronous storage operation has already failed.

Use an asynchronous, versioned local recovery store (IndexedDB or the application database), debounce writes, and store text by revision rather than duplicating the full base note on every keystroke. Keep a write-ahead “draft saved at” indicator and test recovery after forced process termination. Draft keys should include a stable vault identity and a path encoding that cannot collide after case normalization. A moved or reconnected vault needs an explicit reattach flow; today an exact-root match reuses the ID, while a moved root becomes a new connection and strands old local keys.

### P1 — Selection and refresh can retain paths that no longer exist

`loadFiles` replaces `files` but does not reconcile `selected` (`VaultWorkspace.tsx:224-231`). A deletion or rename in Obsidian followed by Refresh leaves the old path selected. The source and summary routes then read all selected files and fail the whole request when one path is missing (`server/vault-routes.ts:160-168, 240-252`). The user gets no per-item explanation and cannot tell which selections are stale.

For source refresh and full-text navigation, model selection as `{path, lastSeenRevision}` and reconcile it after every scan. Mark missing and changed items explicitly. Before an import, show a review of `unchanged`, `changed`, `missing`, and `new`; permit the learner to proceed with the stable subset. A failed item must not make successful, already-snapshotted items appear to have been imported when they were not.

### P1 — Read and preview expansion creates a new content-safety boundary

The current editor uses a textarea, which safely treats Markdown and plugin syntax as text. A rendered preview will change that. Obsidian Markdown may contain raw HTML, inline event handlers, iframes, external images, `javascript:` links, embeds, Dataview/plugin blocks, and content deliberately written as instructions to an AI. Rendering it with an unrestricted Markdown/HTML pipeline can execute script, exfiltrate content through network image requests, or visually imply that plugin output was evaluated when it was not.

Preview must be a separate, sanitized projection:

- parse Markdown without executing plugin code;
- sanitize raw HTML with an allowlist that removes scripts, event attributes, forms, frames, and unsafe URLs;
- default remote images, audio, and embeds to blocked placeholders requiring an explicit per-note action;
- label unsupported plugin blocks as preserved source text, not rendered truth;
- keep “source bytes”, “plain text for search”, and “rendered preview” as separate representations;
- add a safe external-open policy and never let a note control the app's own navigation.

The same boundary applies to generated summaries written into a vault: generated Markdown is untrusted until the user reviews it, and a source note must not be allowed to steer tool execution or file writes. The current summarization prompt does tell the model to treat note content as data (`vault-routes.ts:253-257`); preserve that constraint at the new read/preview boundary.

### P1 — Full-text search cannot be added as a renderer-side filter

The existing search filters the already-loaded filename list in memory (`VaultWorkspace.tsx:114-120`). A vault scan recursively visits entries sequentially, with a 30,000-entry/32-level cutoff and no continuation token (`server/vault.ts:136-181`). Reading every note for each query would repeatedly hit disk, load large strings into the renderer, and contend with edits, source imports, and sync activity. Returning whole draft bodies for a list page has the same avoidable cost (`server/vault.ts:355-363`).

Build a local read model instead:

- index only regular, visible Markdown files and record `rootIdentity`, normalized path, byte revision, size, mtime, and index status;
- tokenize or extract searchable text in a worker/utility process with bounded concurrency and cancellation;
- update incrementally from a filesystem watcher plus periodic reconciliation, because watchers can miss events or be unavailable on sync volumes;
- make queries paginated by stable `(revision, path)` or a cursor, with match ranges and a visible `indexing/stale/incomplete` state;
- cap result snippets and never send full vault contents to the renderer or a provider for a search operation;
- avoid trusting mtime alone; the raw-byte hash remains the content identity.

For previews, read the selected note on demand and stream or cap the response. A 1 MB note limit is an editor limit, not a reason to read 30,000 notes into memory. Search should continue to work for notes too large to edit, with a clear “read-only preview” state.

### P2 — Path checks reduce accidental escape but do not close all filesystem races

`notePath` rejects traversal-like components and `checkedPath` walks with `lstat`, excluding symbolic links (`server/vault.ts:80-133`). That is a good baseline. The check and subsequent `open`/`rename` are still separate operations. A process that can modify the selected folder can swap a checked directory or file for a junction/symlink between them. The root is canonicalized on connection, but there is no persistent directory handle or platform-specific no-follow/open-beneath primitive.

This is primarily a same-machine threat model issue rather than a normal Obsidian workflow issue. Document the boundary and, where available, use directory handles and no-follow flags; re-check canonical identity after read/write; keep the existing “linked paths are not editable” behavior. Also test junctions, symlinks, removable drives, exFAT, and cloud placeholders on every supported desktop target. The current review evidence only says real sync volumes and native Mac remain unverified (`docs/obsidian-vaults.md:38, 42`).

### P2 — Pagination and operation ownership need stable cursors

Older drafts are requested with `offset=${drafts.length}` (`VaultWorkspace.tsx:863-879`), while the server orders by `rowid DESC` (`server/vault.ts:355-363`). A new draft arriving between pages changes the offset window and can skip or duplicate a record. Similar instability will appear when full-text results are paginated while the index changes.

Use an opaque cursor based on a stable sort key, and return `nextCursor` plus an index generation. On a new scan or index generation, either continue from the captured generation or explicitly restart the query. Keep an operation ID for long scans/imports so cancellation and late responses cannot update a newly selected vault. The component already uses a serial guard for opening notes (`VaultWorkspace.tsx:331-361`); extend that ownership rule to scans, imports, previews, refreshes, and summary drafts.

### P2 — Notebook creation/import needs a single visible transaction boundary

Vault imports read selected files before entering `withArtifactMutation` and then append all fresh sources to the notebook (`vault-routes.ts:160-221`). This prevents partial notebook mutation on a read failure, which is good, but the user-facing operation has no import manifest or resumable result. A long 50-note import can hold up to 5 MB of raw bytes plus decoded strings in memory before the aggregate check, and source creation is all-or-nothing without item-level status.

For the expanded flow, create an import manifest first: selected path, observed revision, byte count, and status. Read and validate with a bounded concurrency limit, then commit one notebook transaction containing only the validated snapshots. Return per-item statuses and a stable import ID. If the app crashes after some originals are written but before the notebook is committed, reconciliation must either reuse those exact content-addressed originals or garbage-collect only unreferenced artifacts under the existing artifact policy. Never report a successful refresh from an in-memory read that was not committed to the notebook.

The notebook-generation lock is keyed by `notebookId` and is useful for avoiding concurrent source mutation during generation (`vault-routes.ts:170-175, 232-238`). Keep that lock around refresh/import commit, and make notebook creation preserve the user's current vault draft and selected paths. A newly created notebook should not silently change the active selection while an import or summary request is in flight.

## Proposed architecture

Treat the integration as four explicit layers, each with its own revision and lifecycle:

1. **Vault adapter.** Owns root identity, safe path resolution, bounded directory enumeration, file reads/writes, watcher events, and the platform-specific publication protocol. It returns exact bytes plus a revision and reports `missing`, `changed`, `unreadable`, `too-large`, and `unsupported` distinctly.
2. **Vault read model.** Stores file metadata, extracted searchable text, index generation, and preview cache keyed by byte revision. It is disposable and rebuildable. It never becomes the source of truth for writes, and stale results carry their stale revision visibly.
3. **LMBook snapshot model.** Stores immutable content-addressed source bytes and structured origin metadata. Notebook sources, episodes, flashcards, and summaries refer to `{sourceId, origin, revision}`. Refresh creates a new source snapshot and leaves prior learning artifacts explainable.
4. **Recovery/privacy store.** Stores editor drafts, conflict copies, history, and AI drafts with quotas, encryption/OS protection where practical, retention controls, and explicit purge. It is separate from the live vault and is not implied to be backed up by a notebook ZIP.

The UI should then expose the state transitions directly: `indexed at revision`, `previewing revision`, `draft based on revision`, `vault changed`, `refresh available`, `source snapshot committed`, and `recovery copy retained`. This keeps a stale search result from becoming an accidental AI input and keeps a generated note from looking like an authoritative source.

## Acceptance workflows

These are concrete manual workflows for the next implementation/review pass. They are acceptance evidence, not proposed automated tests.

### 1. Byte-preserving shared edit

Use a disposable vault containing UTF-8 BOM, CRLF and LF files, frontmatter, Dataview/code blocks, raw HTML, duplicate basenames, a large read-only note, an attachment, a hidden `.obsidian` folder, and a junction/symlink. Connect it, scan it, open each supported file, and verify the original bytes remain identical until an explicit save. Save a small edit and verify only the intended bytes/line-ending policy changed; hidden configuration, attachments, temp files, and unrelated notes are unchanged.

Kill LMBook during a new-note write and during an existing-note replacement. On restart, there must be either the old file or the complete new version, plus a visible recoverable draft/conflict copy. A partial target must never be presented as a successful save. Repeat while an external editor and a cloud-sync simulation change the note in the check-to-publish window; the result must be a conflict or an explicitly preserved “save both”, never a silent overwrite.

### 2. Full-text index and sanitized preview

Connect a fixture with at least 30,000 mixed entries, more than the current depth limit, unreadable folders, duplicate basenames, and notes larger than the editor limit. Start indexing, cancel it, close and reopen the workspace, and reconnect after a watcher event. Search must show whether results are complete, stale, or partial; it must page without loading all note bodies into the renderer and must find exact text in read-only oversized notes.

Open a note containing raw HTML, an event handler, an iframe, remote image/audio links, a `javascript:` link, a plugin code block, a wikilink, and an embed. The preview must render safe Markdown, visibly preserve unsupported syntax, block execution and remote fetches by default, and leave the source bytes unchanged. A selected heading/block result must map back to the exact note revision used for the preview.

### 3. Concurrent edit, rename, delete, and refresh

Open a note in LMBook, edit it in Obsidian, and trigger LMBook's save at each boundary: before external save, after external save, during sync, and after a rename/delete. Verify that the UI keeps the user's draft, shows the current vault version, and offers keep-vault, keep-draft, save-both, or deliberate merge. Refresh the file list and confirm stale selected paths are marked and cannot be silently imported.

Rename a selected note without changing its bytes. Refresh must report “moved/unknown” until the user confirms the relationship; it must not silently retarget old citations. Reconnect the same vault at the same root, at a moved root, and at a different vault with the same basename. Recovery and source provenance must remain attached only when identity is proven.

### 4. Import and source refresh provenance

Import the same path and bytes from two different vaults into one notebook. Both origins must remain distinguishable. Re-import unchanged content from the same origin and verify an idempotent result. Change one byte, refresh, and verify a new immutable source snapshot with old episodes/flashcards still pointing to the old revision. Delete the live note and refresh; verify a clear missing state and preserved prior snapshot. Import while notebook generation is running, cancel halfway, and restart; verify no duplicate, partially committed, or unreferenced source artifacts are reported as successful.

### 5. Privacy, cancellation, and lifecycle

Select three notes while leaving a fourth note and all attachments linked from them. Run an AI summary and inspect the captured provider request: only the three selected snapshots and the learner prompt are present; no filename search result, unselected note, attachment, plugin output, or hidden folder is sent. Show the provider, account, retention, and cancellation behavior before submission. Cancel during reading and during provider generation; no summary draft or active job remains unless the user explicitly chose to retain it.

Disconnect a vault, restart LMBook, reconnect it, and inspect recovery/history/draft storage. Exercise quota or database failure, OS shutdown, and explicit purge. The app must identify what remains locally, what is backed up by a notebook ZIP, and what was deleted, with byte counts. A user who chooses “forget this vault” must not leave note text in the hidden history or generated-draft tables.

### 6. Notebook creation and navigation ownership

Start with a dirty vault draft and a nonempty selection. Create a new notebook, switch notebooks, import sources, and draft a summary in parallel with a file refresh. The dirty draft, selected paths, current vault, and operation ownership must survive navigation; a late response from the old notebook or vault must not replace the new editor. Load older drafts while creating new ones and verify cursor pagination has no skips or duplicates.

## Open questions before calling this 0.4-ready

- Which real sync providers and filesystems are in the owner's normal workflow? The answer determines whether the write path can offer a strong compare-and-swap guarantee or must default to save-both/conflict copies.
- Is the intended privacy promise “local-only until the learner invokes AI,” or is cloud provider submission acceptable with disclosure and a local-model option? The current UI says opening a vault sends nothing; the summary action intentionally sends selected text to the notebook's provider.
- How long should recovery history and AI drafts remain, and should application data be encrypted or excluded from normal backups by default?
- Which Obsidian semantics are required for the first release: plain Markdown, heading/block links, embeds, attachments, Canvas, or particular plugins? Each supported semantic needs a fixture and an explicit preservation/rendering rule.
- Does “refresh” mean refresh a live source snapshot, refresh the local index, or both? These should remain separate actions in the model and UI.

The current preview is a sound starting point for a shared Markdown workspace, but it should not be described as full Obsidian compatibility. The next work should make revision identity, publication outcome, source lineage, search freshness, preview safety, and recovery retention visible before adding breadth.
