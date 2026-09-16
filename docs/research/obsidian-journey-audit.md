# Obsidian journey audit

16 September 2026. This is a research-only review of the shared-vault journey in the `feat/shared-vault` worktree (`abc6e87`). It covers connecting a vault, finding and editing a note, following note relationships, selecting notes for learning, choosing a new or existing notebook, reviewing a generated note, and returning to Obsidian. It does not propose embedding Obsidian or claiming plugin compatibility.

The report combines the current implementation and product notes with official Obsidian help and W3C accessibility guidance. It is a journey audit, not participant evidence or a formal WCAG conformance audit.

## Finding in one sentence

The implementation reliably protects files and keeps a recoverable editor, but the user journey loses the thread between *where a note came from*, *what the user selected*, *which notebook will receive it*, and *what the model produced*. The next iteration should make that thread persistent and inspectable before expanding into broad Obsidian feature coverage.

## What exists today

The current page has one heading and vault connector, a vault selector with root path, refresh and disconnect actions, a two-button `Notes` / `AI drafts` switch, a filename-or-folder substring search, note checkboxes, a raw Markdown textarea, conflict and recovery history disclosures, a basic outgoing `[[note]]` disclosure, and a separate `Use your selected notes` section at the bottom of the page ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L540)).

The existing behavior is valuable and should remain the foundation:

- Connecting points LMBook at the selected folder. Files remain in place and the page explicitly says that connecting does not send the vault to a model.
- Editing preserves frontmatter, wikilinks, embeds, code blocks, plugin syntax, BOM and line-ending conventions according to the implementation notes. A dirty edit is kept locally and external changes can produce a conflict instead of a silent overwrite.
- Source import reads selected saved notes and stores immutable snapshots. Re-importing an identical snapshot is harmless; a changed note becomes a new source.
- Summary generation uses only selected Markdown, keeps source snapshots with the AI draft, appends numbered source paths, and requires `Save new note` after review.
- The release notes clearly state current boundaries: no heading or block navigation, backlinks, rendered embeds, rich Markdown preview, graph, Canvas, folder creation, automatic rename/link rewriting, or plugin execution ([`docs/obsidian-vaults.md`](../obsidian-vaults.md#current-boundaries)).

These are implementation facts, not claims that the workflow has been accepted by the owner or tested with a real Obsidian installation, plugin set, or sync service. The release gate remains closed.

## The journey as a learner experiences it

1. **Connect.** The user selects the same folder they use in Obsidian. The page explains the boundary well, but the first meaningful action is a folder picker rather than a clear statement of what a selected note can become in LMBook.
2. **Find.** The user searches a flat list by filename or path. Folders are represented as path strings, and only 100 results are shown before `Show more notes`. There is no tree, breadcrumb, recent-note list, content search, or keyboard switcher.
3. **Open and read.** Clicking a row opens a raw source textarea and immediately focuses it. There is no rendered reading view, live preview, outline, or side-by-side reading/editing mode. The page can preserve Markdown while still making it hard to understand how the note will read in Obsidian.
4. **Orient.** The current note's outgoing wikilinks are hidden in a disclosure near the bottom of the editor. The implementation strips aliases and heading/block fragments before matching names, so link context and destination location are lost. Backlinks, unlinked mentions, and previews are absent.
5. **Select for learning.** Checkboxes sit beside file-open buttons. The selection remains in page state and a small `N selected · Use notes` control jumps to a distant section. That section contains the destination notebook selector and actions, so the user must maintain a selection while moving between separate page regions.
6. **Choose a destination.** Existing notebooks appear in one select. When none exist, the page offers `Create a learning notebook`; the selected files are not summarized in the creation action, and the handoff back from the notebook dialog is not explained in this component. The destination's connection, model, language, or current source state is not visible at the point of consent.
7. **Generate and review.** `Draft summary` switches to the AI drafts tab and opens the output in the same raw editor used for ordinary notes. The provenance panel and original snapshots are below the editor in a disclosure; source references are plain numbered paths rather than jumpable evidence. `Save new note` is available without an explicit destination-folder step, save-as-new collision explanation, or rendered review.
8. **Return to Obsidian.** `Open in Obsidian` sends a URI for an existing file. There is no equivalent handoff for a selected source, a generated draft before saving, an exact heading/block target, or a clear fallback when Obsidian is not installed or the vault is not registered there.

This sequence is coherent for a small, flat vault and a user who already understands Markdown. It becomes fragile when a user has a large vault, needs to compare a note with its context, selects files for a new notebook, or must verify an AI note before publication.

## Prioritized gap register

Priority means journey risk for the confirmed shared-vault use case. It does not mean that every item must be shipped in one release.

### P0 — Make the source-to-learning handoff explicit

**Gap.** The selection controls and learning destination are physically separated ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L750), [`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L1192)). The user sees only a count until reaching the bottom; the action text does not show which saved files, revisions, or approximate size will be sent. The summary disclosure and source-import action use the same selection but imply different outcomes. Creating a new notebook is delegated to a parent dialog with no visible handoff contract.

**Recommendation.** Replace the distant jump with a persistent selection tray attached to the notes workspace. It should list selected paths (collapsible for many files), show note count and characters/bytes, identify empty, too-large, changed, or unavailable notes, and expose two explicit destinations: `Add to existing notebook` and `Create a new notebook`. After the notebook dialog closes, return to the tray with the selection and chosen destination intact. Keep `Add sources` and `Draft summary` separate, with a one sentence description of what each stores or sends.

**Observable acceptance.**

- A user can select notes, open the new-notebook dialog, create a notebook, and see the same selected paths and count waiting in the tray when the dialog closes.
- The existing-notebook path shows the notebook title and the connection/model used for the request before the user activates `Add as notebook sources` or `Draft summary`.
- Before either model or source request begins, the user can inspect the exact path list and the saved-note size; no hidden or linked note is included.
- A changed file is marked as changed and the user can refresh or continue with a clearly named saved version. A failure names the affected path and keeps the selection.

This should be the first journey change because a technically correct snapshot is still a poor experience if the user cannot tell what is about to happen.

### P0 — Turn AI output into a provenance-first review step

**Gap.** The generated draft is opened as a normal raw note, with the review evidence below it ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L913), [`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L1132)). The output includes `[1]`, `[2]` references and an appended source list, but references are not links to the corresponding snapshot. There is no at-a-glance distinction between model text, user edits, source snapshot age, and current-vault changes. The only destination action is `Save new note`, while the generated filename is auto-derived and collision-suffixed.

**Recommendation.** Introduce a draft review frame with a visible state such as `AI draft · 2 saved source snapshots · not in vault`. Keep the draft editable, but make source provenance a first-class companion panel: each source path, revision/date, current-file status, and a control to read the exact snapshot. Make numbered citations jump to the snapshot or show an adjacent excerpt. Add `Preview` and `Markdown` modes so the user can review the reading result and raw syntax. Saving should ask for a destination folder and filename, preview the collision result, and keep the unsaved draft if the write fails.

**Observable acceptance.**

- Opening a generated draft immediately shows its AI state, source count, and review status without requiring a disclosure to be opened.
- Selecting `[1]` opens the exact immutable snapshot supplied to the model; editing the live vault later cannot change that evidence.
- A source changed since generation is visible as `live file changed`; it never silently replaces the snapshot used for review.
- The user can switch between rendered preview and raw Markdown without changing the saved bytes.
- Saving a generated note requires an explicit folder and filename (or a clearly displayed default), reports an existing-name collision before replacement, and leaves the draft recoverable after cancellation or failure.

The current source snapshots and append-only references are a strong base. The missing piece is making them visible at the moment the user decides whether the output is trustworthy enough to write.

### P1 — Rebuild navigation around the active note

**Gap.** `Notes` and `AI drafts` are sibling buttons with `aria-pressed`, but they are not a full tab/tabpanel interaction and do not provide recent notes, tabs, pinned notes, or a folder tree. The list uses a path substring filter only ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L683), [`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L709)). Opening a note replaces the editor view and does not show a stable location, previous/next history, or a way to reopen the last few notes.

**Recommendation.** Keep a compact file navigator beside the editor on desktop and a drawer on narrow screens. Add expandable folders, breadcrumbs, active-file auto-reveal, recent notes, and a keyboard quick switcher. The navigator should distinguish `Notes`, `AI drafts`, and `Recovery drafts` as sources with different states rather than a generic two-button toggle. Keep one active note identity visible while the list is collapsed.

Obsidian's official File explorer is more than a filename list: it manages files and folders, creates notes in a chosen folder, supports sort order, auto-reveals the active file, and offers rename/move operations ([File explorer](https://obsidian.md/help/plugins/file-explorer)). Its Quick switcher opens with `Ctrl+O`/`Cmd+O`, searches names or aliases, supports arrow-key selection, toggles recent notes when empty, and can create or open a note ([Quick switcher](https://obsidian.md/help/plugins/quick-switcher)). LMBook does not need every Obsidian command, but these patterns describe the minimum navigation expectations for an everyday shared-vault workspace.

**Observable acceptance.**

- A user can locate a note by folder tree, path breadcrumb, or `Ctrl+O`/`Cmd+O` fuzzy search without scrolling through the full list.
- The active note is highlighted and its folder is revealed; closing and reopening the navigator does not lose the active note or selection tray.
- On a keyboard-only pass, focus moves from navigator search to actions to file rows to the selection tray in a meaningful order. Opening a note returns focus to the editor; toggling the navigator returns focus to its trigger.
- On a narrow viewport, the file drawer, editor, selection tray, and destination actions remain reachable without forcing the user to remember hidden state.

### P1 — Add a reading surface and preserve editing modes

**Gap.** The only note view is a `textarea` with `spellCheck={false}` ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L1016)). This is faithful for source editing but weak for reading and AI review. It also makes unsupported syntax indistinguishable from syntax that simply has not been rendered. The current page explicitly leaves embeds, rich preview, and plugin execution out of scope, but it does not provide a deliberate reading mode for the supported Markdown subset.

**Recommendation.** Add a clearly labeled `Reading` / `Edit` control. In Edit, support a raw Source mode first and consider Live Preview only when its preservation behavior is proven. In Reading, render the safe supported subset and show literal fallback blocks for unsupported plugin syntax, embeds, or invalid Markdown. Add an outline for headings and jump to a heading without pretending to support every Obsidian extension. Keep the raw editor as the authoritative write surface.

Obsidian treats Reading view and Editing view as separate views, with Live Preview and Source mode inside Editing; it supports side-by-side reading and editing and `Ctrl+E`/`Cmd+E` to toggle views ([Views and editing mode](https://obsidian.md/help/edit-and-read)). Its Markdown documentation also makes internal links and heading structure part of the note format ([Basic formatting syntax](https://obsidian.md/help/syntax)).

**Observable acceptance.**

- A user can read a Markdown note as formatted content, switch to raw editing, and switch back without changing bytes, line endings, frontmatter, or plugin syntax.
- A heading outline identifies supported headings and jumps the reading/editor caret to the selected heading.
- Unsupported content is labeled as preserved literal Markdown or delegated to Obsidian, so an empty-looking render is never mistaken for missing content.
- AI draft review uses the same Reading surface as ordinary notes and keeps citations/provenance visible alongside it.

### P1 — Make links useful before claiming graph compatibility

**Gap.** The current `links` calculation recognizes only a simple `[[name]]` form and strips aliases and `#heading` fragments before matching ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L521)). The UI opens the whole matching note and lists duplicate basename matches without showing why one is preferred. It does not show incoming links or unresolved targets.

**Recommendation.** Implement a small, explicit relationship layer before graph or Canvas work:

1. Parse wikilinks and Markdown links into target, alias, heading, and block parts.
2. Resolve exact vault paths first, then duplicate basenames with an explicit chooser.
3. Show outgoing links, unresolved links, and backlinks in separate disclosures with counts.
4. Support a safe page preview for a linked note and a jump target for supported headings/blocks.
5. Never rewrite links automatically until rename/move behavior and duplicate handling are specified.

Obsidian's Backlinks plugin shows linked and unlinked mentions, context, filtering, and a linked backlinks tab ([Backlinks](https://obsidian.md/help/plugins/backlinks)). Its Outgoing links plugin lists active-note links and unlinked mentions, including aliases and duplicate-name disambiguation ([Outgoing links](https://obsidian.md/help/plugins/outgoing-links)). Page preview lets a user inspect a linked page without leaving the active note ([Page preview](https://obsidian.md/help/plugins/page-preview)). Obsidian URI can target a heading or block when properly encoded ([Obsidian URI](https://obsidian.md/help/uri)).

**Observable acceptance.**

- Given `[[Note|label#Section]]`, the UI preserves and displays the label, identifies the target path, and either jumps to `Section` or states that heading navigation is unsupported.
- Given duplicate basenames, the UI displays full relative paths before opening one.
- Given an incoming link from another note, the active note shows that backlink and its context; given an unresolved link, it is visibly unresolved and never presented as an openable file.
- Opening a link does not discard an unsaved editor draft or selection tray.

### P1 — Complete the shared-file lifecycle deliberately

**Gap.** LMBook can create a `.md` file by typing a path, but the component cannot create a folder, rename an existing note, move a note, or expose a safe delete/recover action ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L928)). Obsidian's File explorer treats create, rename, move, and delete as common file operations. The current limitation is acceptable as a preview boundary only if the UI does not imply that it is a complete vault manager.

**Recommendation.** Add folder-aware new-note creation and explicit note actions in stages. First add a destination-folder chooser and a visible `Create folder` path. Next add rename/move with a link-impact preview. Defer delete until the recovery and cross-editor semantics are explicit; if deletion is not implemented, say so in the note action menu and direct the user to Obsidian.

**Observable acceptance.**

- A new note can be created in a selected existing folder without manually typing a slash path.
- The user can see whether the note is a live vault file, a new draft, a recovered draft, or an AI draft before using a destructive or publishing action.
- Rename/move cannot silently break a supported link; the UI either updates links with a documented plan or asks the user to review affected links.
- Any unsupported file operation has a nearby, consistent explanation and `Open in Obsidian` handoff.

### P1 — Treat external edits and sync as a visible state

**Gap.** The page polls only the open note every four seconds and performs a full scan on focus or explicit Refresh. This catches an open-note conflict, but it does not make external changes to the list, selected notes, or generated-draft evidence visible before a learning action. The conflict controls offer `Keep editing my draft`, `Use saved version`, and `Save my draft as a copy`, but there is no side-by-side or three-way view; the first option can still lead to an overwrite after the user manually edits ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L959)).

**Recommendation.** Add a vault freshness indicator and a `changed since selection` state. Before source import or summarization, re-read selected paths and show a compact review of changed, missing, or empty notes. For an open conflict, show a two- or three-pane comparison with explicit `Use live`, `Use draft`, `Copy`, and `Merge manually` actions. Keep save as an intentional final action.

**Observable acceptance.**

- An external rename, deletion, or content edit produces a visible freshness state after Refresh/focus and before a model request.
- A conflict presents the saved version and current draft in comparable regions; the user can leave without losing either.
- No save path can silently overwrite a newer external revision; an explicit overwrite/merge decision is recorded in the visible state.
- Testing with a disposable local fixture remains separate from claiming behavior with Obsidian Sync, cloud folders, or real plugins.

### P2 — Add keyboard and assistive-technology affordances as part of the journey

**Gap.** The page has some good native semantics (`label`, buttons, checkboxes, `role=status`, and `role=alert`), but the most important transitions are not fully expressed: the Notes/AI drafts controls are not a complete tablist, focus does not visibly move to the generated draft review, the selection jump depends on a distant section, and a live status paragraph contains the `Stop generation` button ([`VaultWorkspace.tsx`](../../src/components/VaultWorkspace.tsx#L572)). Only save has a documented keyboard shortcut in the editor.

**Recommendation.** Use native tabs or a complete tablist/tabpanel pattern for view switching, preserve focus after every disclosure/drawer/dialog transition, keep interactive controls out of status-only live regions, and add discoverable shortcuts for quick switching, search, save, and toggling reading/editing. Ensure Ink outlines remain visible against selected, current, conflict, and disabled states.

W3C guidance requires keyboard operation for all functionality ([Keyboard, SC 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard)), a meaningful focus order ([Focus Order, SC 2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order)), and a visible focus indicator ([Focus Visible, SC 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)). Dynamic success, progress, waiting, and error text must be programmatically identifiable without taking focus ([Status Messages, SC 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)); custom controls need name, role, state, and value ([Name, Role, Value, SC 4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)). Pointer targets should be at least 24 by 24 CSS pixels or have sufficient spacing ([Target Size, SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)).

**Observable acceptance.**

- A keyboard-only user can connect (through the native picker), switch vaults, search, open notes, select notes, choose a notebook, draft a summary, review it, and save it without a pointer.
- Focus is visible, never trapped, and returns to the control that opened a drawer, disclosure, or dialog unless the next task has a clearly announced destination.
- `Saved`, `Opening`, `Writing summary`, `Draft ready`, conflict, and error messages are announced as status/error updates without moving focus unexpectedly.
- At a 390 CSS-pixel viewport, every essential control meets the target-size or spacing guidance and the selection tray remains available when the file list is collapsed.

### P2 — Publish a support matrix for Markdown and Obsidian boundaries

**Gap.** The page says that plugin settings and attachments are untouched and plugin code runs in Obsidian, but a user cannot tell at the point of opening, selecting, or reviewing a note whether its embeds, properties, tasks, Canvas links, external links, or plugin-produced blocks will be visible in LMBook. A preserved literal block is safer than data loss, but it still needs an explanation.

**Recommendation.** Add a compact, linked support matrix in the vault introduction and in the note/draft review context. Classify each feature as `rendered in LMBook`, `preserved but literal`, `not followed into AI selection`, or `open in Obsidian`. Include the exact scope limits (1 MB editor, 50-note import, 80,000-character summary) next to the action that can hit them.

**Observable acceptance.**

- A user can inspect a note's support status before sending it to a model.
- Attachments, embeds, plugin code, and hidden folders are never silently included in a summary; the UI states that they were excluded or preserved literally.
- The user can open the same live path in Obsidian from the note and from a support warning when Obsidian is installed, with a useful fallback when it is not.

## Recommended target journey

The target is a single workspace with persistent context, not a sequence of unrelated pages:

1. Connect a vault and see its root, freshness state, support boundary, and recent/recovery activity.
2. Find a note by folder tree, content search, or quick switcher. Keep the active path and unsaved state visible.
3. Read, preview, or edit the note. Show an outline and useful outgoing/backlink context without rewriting unsupported syntax.
4. Select notes in a persistent tray. Review exact paths, saved revisions, size, exclusions, and destination.
5. Choose an existing notebook or create a new one while the tray remains intact. Make `Add sources` and `Draft summary` separate, consented outcomes.
6. For a summary, enter a review frame that shows the draft, rendered preview, source snapshots, citations, and live-file drift. Keep the draft local until the user chooses a folder and filename.
7. Save as a new file with collision and write-state feedback, then offer `Open in Obsidian` for the exact saved path. Return to the same vault context with the new note highlighted.

The sequence preserves the product's confirmed boundaries: selected notes are the only model input, original files remain separate from generated interpretation, source snapshots remain inspectable, and LMBook remains useful without Obsidian.

## Evaluation plan for the next UI pass

Use authored disposable vaults and a keyboard-only pass before owner review. The cases below are observable product checks, not evidence of educational effectiveness:

- **Navigation:** 3 folders, duplicate basenames, 40+ notes, one note with a long path; locate by tree, content search, and quick switcher; active-file context remains visible.
- **Reading/editing:** frontmatter, aliases, headings, block IDs, embeds, a code block, and a plugin call; toggle reading/editing and verify bytes and unsupported syntax are preserved.
- **Selection:** select notes from different folders; change one externally; choose a new notebook; verify the tray, destination, count, and stale state survive the dialog and request failure.
- **Review:** generate a deterministic draft from two notes; open citation 1 and its exact snapshot; modify the live source; verify the snapshot remains unchanged and drift is visible; save to a chosen subfolder with an existing-name collision.
- **Conflict/recovery:** edit in LMBook, change in a second process, refresh, compare, leave, reload, and recover both versions without silent replacement.
- **Keyboard/mobile:** operate the complete journey with Tab/Enter/Space/arrow keys at desktop and 390-pixel widths; verify focus visibility, focus return, status announcements, and 24-pixel target/spacing expectations.
- **Handoff:** with and without an installed/registered Obsidian app, open an exact file and (when supported) heading/block target; verify the fallback explains what happened.

## Sources and limitations

Primary sources used:

- Obsidian, [How Obsidian stores data](https://obsidian.md/help/Files%2Band%2Bfolders%2FHow%2BObsidian%2Bstores%2Bdata): vaults are local folders of Markdown files, external edits are observed, and `.obsidian` holds vault-specific configuration.
- Obsidian, [File explorer](https://obsidian.md/help/plugins/file-explorer), [Quick switcher](https://obsidian.md/help/plugins/quick-switcher), [Search](https://obsidian.md/help/Plugins/Search), and [Command palette](https://obsidian.md/help/plugins/command-palette): official navigation, search, keyboard, folder, and file-operation patterns.
- Obsidian, [Views and editing mode](https://obsidian.md/help/edit-and-read) and [Basic formatting syntax](https://obsidian.md/help/syntax): Reading/Edit/Live Preview/Source behavior and Markdown links/headings.
- Obsidian, [Backlinks](https://obsidian.md/help/plugins/backlinks), [Outgoing links](https://obsidian.md/help/plugins/outgoing-links), [Page preview](https://obsidian.md/help/plugins/page-preview), [Outline](https://obsidian.md/help/plugins/outline), [File recovery](https://obsidian.md/help/plugins/file-recovery), and [Obsidian URI](https://obsidian.md/help/uri): relationship context, recovery, navigation targets, and cross-app handoff.
- W3C WAI, [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and the linked Understanding documents for [Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard), [Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order), [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible), [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages), [Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html), and [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

Limitations:

- Official Obsidian help documents intended product behavior; they do not prove that every Obsidian user needs every feature or that a particular plugin/theme behaves identically.
- W3C Understanding pages explain and illustrate the normative criteria but are not a substitute for a full accessibility audit or assistive-technology testing.
- This pass inspected the committed `VaultWorkspace.tsx`, its styles, product notes, and implementation notes. It did not add code, run tests, use a paid provider, interview a learner, or validate a real Obsidian/plugin/Sync setup.
- No user research was performed. The priorities are reasoned from the owner's confirmed bidirectional shared-vault need, existing implementation boundaries, official platform behavior, and failure consequences. Owner acceptance and real-vault evaluation remain open.
