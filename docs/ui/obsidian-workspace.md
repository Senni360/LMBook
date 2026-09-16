# Obsidian workspace refinement

16 September 2026. In progress, following the owner's request for a substantial Obsidian-focused iteration. This is an Operate surface with a quiet Read mode, extending the chosen Ink design. It is not a replacement visual identity or an embedded Obsidian application.

## Confirmed direction

Existing vault files remain shared with Obsidian. People must be able to find and read their notes, edit or create files, select material for learning, create a new notebook directly from that selection, and review generated work before saving it into their vault. The owner explicitly prefers eventual rendering of popular plugins' Markdown output without executing or embedding plugins, but has deferred plugin-specific work behind these everyday journeys. Unsupported markup must remain intact.

The owner authorized Luna and OpenCode GO Muse Spark 1.3 Contributor assistance. New automated tests remain deferred until the owner requests wrap-up. Builds, existing checks and manual visual workflows remain available. The 0.4 release gate remains closed.

## Surface concept

A working desk with three purposeful regions: a compact file navigator, a generous note reading/writing surface, and a learning selection that stays attached to its destination and review state. Opening a note and selecting it for learning are distinct actions. File location, reading/editing mode, save state and return navigation remain visible. Dense controls belong in contextual disclosures; the note itself is not enclosed in stacks of decorative cards.

Blue identifies active controls and learning selection. Precise system typography carries note content. Shared Ink contours carry hover and focus feedback; content does not slide sideways on navigation. Reduced motion and forced colors remain functional. Narrow windows expose navigator and learning regions deliberately without losing their state.

## Intended acceptance journeys

- Connect an authored nested vault, find a note by filename, alias, tag or content, follow a heading link, return, and recover the same working context after restart.
- Read Markdown tables, tasks, callouts and safe local images; inspect preserved unsupported blocks; edit without silently changing frontmatter or content.
- Select notes across folders, keep the selection while reading, review unavailable/changed/duplicate material, create a new notebook or use an existing one, and proceed directly to its learning tools.
- See that imported sources are snapshots. Inspect later source changes and deliberately refresh them while retaining existing lesson and flashcard evidence.
- Edit while Obsidian changes a file; keep both versions available, recover unfinished work after navigation/restart, and save explicitly.
- Generate from selected saved notes, continue navigating while generation runs, inspect original source snapshots and drift, choose a destination, and save a reviewed note as a new file.
- Complete the same important actions using the keyboard and at narrow widths. Evaluate actual rendered states with vision, including empty, large, missing, invalid, busy, failure and recovery states.

## Evidence and unresolved questions

[Journey research](../research/obsidian-journey-audit.md) and [integrity review](../research/obsidian-integrity-audit.md) provide recommendations, counterexamples and primary references. They are not learner trials. The initial Muse Spark critique used a bounded architecture excerpt, not full application access; several proposed safeguards already existed. Its run metadata remains in the ignored contributor evidence directory.

Filesystem writes cannot provide a universal transaction with unrelated editors and sync clients. Existing revision checks and recovery are retained; further conflict evaluation must describe this limit accurately. Broad plugin execution, Canvas/Excalidraw editing and automated link rewriting are not implied by this iteration. Large-vault search needs bounded local indexing with visible incompleteness. Recovery storage needs a visible lifecycle without silently purging unfinished work.

Completion observations will be added after the implementation and separate visual/behavioral review passes. No acceptance, educational improvement or hours-worked claim is made by this plan.

## 16 September checkpoint and next work

Worktree: `.work/lmbook-custom-ui`, branch `feat/shared-vault`, baseline `abc6e87`. Changes are not committed, mirrored into the owner's root checkout, packaged or released. Preserve the dirty root and other threads. The last delivered installer remains the earlier 0.3.11 package.

The authored Electron fixture at `.work/vault-refinement-1789557629824` exercised cross-folder selection into a new notebook, explicit source refresh, comparison, direct source-to-vault handoff, nested wiki-link navigation, unfinished draft restoration after restart, explicit save, new-file creation inside an empty folder, and conflicting external/local edits saved as separate files. A historical assistant message with a recorded source hash retained its earlier text and original download after the current source changed. Hash-less legacy messages are not backfilled with potentially newer text. Current renderer error collection was empty in those settled workflows.

Visual inspection at 1440 and 390 px corrected duplicate headings, inconsistent note naming, source-review bulk, comparison readability/alignment, scrolling regions and narrow toolbar composition. The latest narrow toolbar uses wrapping so Learn remains visible; the final CSS was inspected live before persisting. Screenshots `desktop-learning-reviewed.png` and `narrow-reading-reviewed.png` are in the fixture directory. Some screenshot calls on a resized hidden Electron window timed out; native Electron capturePage supplied the inspected images. A first recovery diagnostic inspected only CodeMirror's virtualized visible lines and missed offscreen text; checking the complete rendered note confirmed recovery.

Current TypeScript, desktop build and all 38 existing tests passed at this checkpoint. The three existing backup-v3 tests also passed independently. No automated test files were written. Existing checks do not comprehensively exercise the new vault feature or establish learning effectiveness.

Next implementation/evaluation pass: large-vault index/pagination and partial scans; quick-switcher keyboard and tag/search behavior; generated-summary review/cancellation under the redesigned UI; storage-failure and forced-exit recovery; moved-folder reconnect and storage-purge races; meaningful empty/error states; intermediate 700–1250 px widths; independent final review of the integrated changes. CodeMirror undo continuity, backup round-trip of actual chat snapshots and repeated revision history need direct workflow checks beyond the existing generic tests. Real Obsidian/Sync, native Mac, real-course model quality and owner acceptance remain separate unverified work. Do not mark 0.4 ready from this checkpoint.

The owner's intervening background-assistant question is a research discussion, recorded in [the ten-idea proposal](../research/background-assistant-proposal.md); it does not replace the Obsidian refinement or enable autonomous model work.
