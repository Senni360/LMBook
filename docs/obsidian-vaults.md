# Shared Obsidian vaults — 0.4 preview

Implemented in the local 0.3.11 iteration build. Publication remains disabled until the owner approves 0.4. This is LMBook's Markdown workspace over a shared folder, not the embedded Obsidian application.

## Using it

Open **Obsidian vaults** in the sidebar, then **Connect a vault**. Choose the same folder you open in Obsidian. LMBook remembers the connection without moving or copying the vault. You can connect multiple folders, disconnect without deleting files, and reconnect with the same local recovery history.

Open a filename to edit its Markdown. **Save changes** (Ctrl/Cmd+S) writes the shared file; **New note** creates a `.md` file at the vault root or in an existing folder. Unfinished edits are recovered on this device. On narrow screens, **Browse notes** returns to the file list. Filename/folder search and select-all controls are available.

Tick notes, choose a learning notebook, and **Add as notebook sources**. The saved files become source snapshots for existing questions, flashcards and audio workflows. Identical reimports are skipped. Changed files become new sources, preserving earlier material and citations. Opening a vault does not send its contents to a model. Linked notes and attachments are not followed or uploaded automatically.

**Write a summary into this vault** uses the selected notebook's connection and learning settings. Only the selected Markdown text is supplied to the model. The editable result remains an AI draft until **Save new note**. Its original inputs remain available under **Review original source snapshots**, even after those files change. Older drafts can be loaded from the AI drafts list. Summary source references name paths relative to the vault root, so moving the output into a subfolder does not introduce misleading relative hyperlinks. Model output still requires source review; this workflow does not establish factual or educational effectiveness.

## Preservation and conflicts

- YAML/frontmatter, wikilinks, embeds, code blocks and plugin syntax remain literal Markdown. Nothing is executed or reserialized into a narrower document format. UTF-8 BOM and consistent CRLF line endings survive edits; mixed LF/CRLF endings are normalized to CRLF when a note is edited.
- An open note is checked every four seconds while the workspace is visible. Clean notes reload after external changes; unfinished drafts show a comparison instead. Focus and Refresh update the file list. Renamed or deleted notes leave drafts recoverable rather than retargeting them automatically.
- Saving checks the raw-byte hash twice before replacement and serializes LMBook's own writes. Both the submitted draft and the previous file are kept in local recovery history. A conflict offers comparison, continued editing with explicit merging, loading the saved version, or saving a separate copy. It never automatically merges prose.
- Ordinary writes use a flushed temporary file and rename. New files refuse existing names. On filesystems without hard links, exclusive creation is used; a disk failure can leave a partial new file, with the complete draft kept locally. No failed partial file is silently deleted.
- Independent editors and sync services do not share a filesystem transaction. A tiny race remains between the final comparison and rename; this is not a universal atomic compare-and-swap guarantee. Abrupt drive failures and edits after LMBook finishes its write also remain possible. Owner testing with their actual sync setup is required before declaring 0.4 ready.
- `.obsidian`, other hidden folders, attachments and non-Markdown files are left alone. Symlink/junction paths are excluded. Access is restricted to folders selected through the desktop picker; note paths cannot escape the selected root.

Notebook ZIP backups include imported source snapshots and original Markdown bytes. They do **not** back up the live vault, its connection registry, local editor recovery, or the separate summary-draft history. Back up the vault and LMBook's application data separately when needed. Disconnecting retains history locally; it does not erase it.

## Current boundaries

The editor handles UTF-8 `.md` notes up to 1 MB. A listing stops after 30,000 filesystem entries or 32 directory levels, with a warning. Imports accept up to 50 selected notes / 5 MB per batch; one summary accepts up to 50 notes / 80,000 characters, rejecting oversized requests before model submission.

Basic `[[note]]` links can be opened from the linked-notes disclosure. Duplicate basenames show separate choices. Heading/block navigation, backlink indexes, rendered embeds, rich Markdown preview, graph, Canvas, folder creation and automatic rename/link rewriting are not implemented. Plugin code runs in Obsidian; preserving its Markdown is not plugin compatibility. **Open in Obsidian** uses its documented URI protocol and requires Obsidian to be installed and the folder known to it.

## Evaluation, 16 September 2026

The production and desktop builds and all 38 existing application tests passed. No new repository tests were added. An independent finishing review identified recovery-storage failure, hard-link compatibility, subfolder source references and inaccessible older drafts; those findings were addressed.

Disposable Electron workflows exercised connection through the actual IPC bridge (with the picker returning an authored fixture folder), external edits, conflict/copy recovery, saving, source imports, summary drafting/saving, immutable evidence, reconnect persistence, and the Obsidian URI handoff (intercepted rather than launching a real installation). A local deterministic Ollama-compatible fixture checked provider plumbing; no live model or paid provider was called. The fixture text was explicitly illustrative.

Byte checks confirmed UTF-8 BOM, CRLF, frontmatter and Dataview code blocks after an edit. One diagnostic initially read the previous note before its asynchronous open completed; that diagnostic was corrected and the settled-note check passed. Separate ignored filesystem diagnostics checked Windows junction rejection, invalid UTF-8, oversized notes, stale hashes, exclusive creation with simulated missing hard-link support, recovery history, older-draft access and reconnect identity. Actual exFAT/cloud volumes were not exercised.

Visual evaluation used disposable Electron windows at desktop, 700 px and 390 px widths. It corrected flush-edge layout, narrow-screen navigation, hidden button text and editor access. The scoped Impeccable detector reported no findings. The final packaged smoke passed, as did packaged selected-note isolation, summary save, storage-failure retention and cancellation checks. No renderer errors were observed. Delivery details are recorded in WORKLOG.md.

Real Obsidian/plugin operation, simultaneous cloud-sync behavior, native Mac evaluation, live summary quality and owner acceptance remain unverified. The release gate stays closed.

References checked for the integration boundary: [Obsidian file storage](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data) and [Obsidian URI](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI). These explain shared-file observation and URI behavior; they are not evidence that our app has been tested inside Obsidian.
