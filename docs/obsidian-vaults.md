# Shared Obsidian vaults — 0.4 preview

This document describes the shared-vault workflow currently being refined in
the local 0.4 iteration. LMBook reads and writes Markdown in a folder that the
learner also uses with Obsidian; it does not embed Obsidian or run its plugins.
The prior packaged 0.3.11 build is the last evaluated delivery. There is no
0.4 release yet, and no current acceptance run is claimed for the in-progress
changes below.

## Using a connected vault

Open **Obsidian vaults** in the sidebar and choose **Connect a vault**. Select
the same folder used by Obsidian. LMBook stores the connection without moving
or copying the vault. Multiple folders can be connected. Disconnecting keeps
LMBook's local recovery and learning history; it does not delete vault files.

The workspace has a folder hierarchy, paged note lists, filename/content
search, favorites and recent notes, select-all controls, and new note/new
folder actions. The navigator keeps its open folders per vault. A note opens
in a CodeMirror editor with separate **Read** and **Edit** modes. Edit mode
supports Markdown syntax, line numbers, find, wiki-link completion and
Ctrl/Cmd+S. Read mode renders the note and exposes its outline, properties,
links and backlinks. **Open in Obsidian**, **Show in folder**, and copy-path
actions hand off to the native desktop environment where available.

Unfinished edits are stored in LMBook's SQLite recovery store on the local
device. A recovery draft and its saved base can be compared after an external
change, then explicitly merged, reloaded, copied, or saved. A moved vault can
be located again through the folder picker; reconnecting the same vault keeps
its note paths, recovery drafts and source links associated. Choosing a
different folder creates a different connection. LMBook never follows
symlinks/junctions into a vault, allows paths outside the selected root, or
edits hidden folders such as `.obsidian`.

## Markdown reading and preservation

The reader understands ordinary Markdown, frontmatter, GFM tables, fenced
code, callouts, headings and anchors. Wikilinks and Markdown links resolve by
path, basename or alias, report missing and ambiguous matches, and can open a
note at a heading. The context view lists headings, tags, note links and
backlinks from the local index. Plugin syntax, embeds that LMBook does not
render, and other Markdown are preserved as text; no plugin code is executed.

Local image display is allowlisted to PNG, JPEG, GIF, WebP and AVIF assets
inside the connected vault. Remote images and unsupported schemes are blocked
or described as preserved content. Image reads are bounded at 16 MB. UTF-8
Markdown is required for reading/editing; BOM and ordinary line-ending
preservation rules are handled when files are saved. A note cannot exceed the
1 MB reading/editing limit.

The scanner excludes hidden and linked paths. It stops with a warning after
30,000 filesystem entries or 32 directory levels. The SQLite search index has
a 128 MB body budget; notes above 1 MB or beyond that budget remain available
for filename search but are not body-indexed. The navigator renders notes and
folder children in bounded pages so a large vault does not become one giant
DOM list. Index rebuilds are staged and retain the last complete generation if
a later scan is incomplete.

External edits are checked while an open workspace is visible. Clean notes can
reload; a dirty draft shows a comparison. Saves compare the raw-byte revision
before replacement and keep the submitted draft and previous bytes in local
history. Writes use a temporary file and rename, but independent sync services
still leave a small race around the final replacement; testing with the
owner's actual sync setup remains part of release acceptance.

## Sending notes into learning

Select notes in the navigator or note footer and review them in **Learn from
your notes**. The review reads the selected files first and shows readiness,
word/byte counts, missing or empty-note issues, duplicate source information,
and the revisions that will be guarded at import time. Unfinished selected
edits must be saved or discarded before review/import.

Notes can be added to an existing notebook or used to create a new notebook in
the same flow. A new notebook chooses a title, subject, language, optional
settings source, and whether the material is required course material or a
supplement. Import accepts at most **150 selected paths and 5 MB of exact
source bytes**, and a resulting notebook is capped at 150 sources for backup
compatibility. The service validates every note and destination before
persisting a new notebook, stores exact original bytes, skips an identical
vault/path/hash already in the destination, and rejects notes that changed
since review. A failed import does not leave an empty notebook.

The summary action remains an existing-notebook workflow: it accepts at most
**50 selected notes and 80,000 characters** for one request. Only the selected
Markdown text is supplied to the model. The result is an editable AI draft in
the vault, with source paths relative to the vault root and immutable source
snapshots retained for review. The flow does not follow links or upload linked
attachments automatically, and a generated draft still requires source and
learning review.

Notebook source provenance records the vault identity, vault name, relative
path, reviewed revision and import time. Notebook backups validate and retain
this optional provenance so an exported notebook remains portable when its
original vault is unavailable.

## Reviewing linked sources later

Notebook source review groups linked sources by vault and reports **Current**,
**Changed**, and **Missing** states. A changed source can be compared with the
saved snapshot before it is selected for refresh. Refresh requires the live
revision captured during that review and replaces the current source text and
attachment in place, preserving the same source ID. Existing chat, episode and
flashcard snapshots remain unchanged; the UI reports those historical
references while the refresh is being considered. Missing sources are not
silently recreated or refreshed.

Reconnecting a moved vault is required before live comparison or refresh can
run. Saved notebook snapshots remain usable while a vault is disconnected.

## Local storage lifecycle

The vault workspace exposes an inventory for local history, generated summary
drafts, recovery drafts and the search index. History, generated drafts and
the index can each be purged explicitly. Recovery drafts require deleting a
named draft, so an ordinary storage purge cannot sweep unfinished edits.
Purging index data removes only the rebuildable index; the next search/index
run can rebuild it from the vault. Notebook source snapshots and vault files
are not removed by these vault-storage controls.

## Compatibility and release status

Obsidian remains the source of truth for the shared folder. Obsidian plugins,
Canvas, graph views, plugin execution, automatic rename/link rewriting and
full embedded-app behavior are outside this iteration. Plugin compatibility is
a later priority and has no execution or release commitment in this preview.
Real Obsidian sessions, live cloud-sync races, native Mac behavior, live model
quality and owner acceptance are still unverified. Publication remains
disabled until the owner approves 0.4.

## Historical packaged 0.3.11 evaluation — 16 September 2026

The following records the prior packaged checkpoint only. It is historical
evidence, not a current check of the in-progress 0.4 refinement.

The production and desktop builds and all 38 existing application tests passed
for that checkpoint. No new repository tests were added. Disposable Electron
workflows exercised connection through the actual IPC bridge with an authored
fixture folder, external edits, conflict/copy recovery, saving, source
imports, summary drafting/saving, immutable evidence, reconnect persistence,
and the intercepted Obsidian URI handoff. A deterministic local
Ollama-compatible fixture checked provider plumbing; no live model or paid
provider was called.

Byte checks covered UTF-8 BOM, CRLF, frontmatter and Dataview code blocks after
an edit. Separate filesystem diagnostics covered junction rejection, invalid
UTF-8, oversized notes, stale hashes, exclusive creation without hard-link
support, recovery history, older-draft access and reconnect identity. Desktop,
700 px and 390 px visual passes corrected layout edges, compact navigation,
label visibility and editor access; the scoped Impeccable detector returned no
findings. The final packaged smoke, selected-note isolation, summary save,
storage-failure retention and cancellation checks passed, with no renderer
errors observed.

Those checks did not exercise a real Obsidian installation, simultaneous
cloud-sync behavior, native Mac, live summary quality or owner acceptance.
The release gate therefore remains closed. See [WORKLOG.md](../WORKLOG.md) for
the dated continuation record and [the Obsidian feasibility notes](research/obsidian-feasibility.md)
for the separate plugin/embedding boundary.

References for the integration boundary: [Obsidian file storage](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data) and [Obsidian URI](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI).
