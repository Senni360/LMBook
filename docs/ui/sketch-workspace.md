# Owner's flexible workspace

Direction **11 · Your sketch · flexible workspace** implements the owner's two Paint drawings in the UX lab. It starts with notes/sources on the left, chat in the centre, and review/evidence/activity on the right. The second drawing supersedes a fixed three-column interpretation: users can keep several views visible and subdivide panes horizontally and vertically.

Run `npm run desktop:preview` in the active worktree to open the live Electron preview. It starts its own loopback Vite server on port 5190. Renderer edits update through HMR; changes to the preview main process or preload restart the preview window. Closing the window stops its server. The browser equivalent is `http://127.0.0.1:5190/?ux-lab=11` while it runs. The app entry is **Explore workspace designs**, also available in Appearance settings. This remains an isolated interactive prototype with fictional material and simulated AI/audio, not an installed-app release.

## Arrangement controls

- Drag a tab onto a tab strip to move/group it. Drop before another tab to reorder. Drop near a content edge to create a split; the shaded preview identifies the destination.
- Tabs are directly draggable, with grip marks and a shaded destination shown during the drag. There are no persistent split buttons. Each pane's **+** menu retains keyboard-accessible placement, move, reopen, focus and close actions.
- Splitting a group with several tabs moves its active tab to the new pane. Splitting a single-tab group creates an empty pane with view choices. Splits nest recursively, allowing chat above two other views while the side panes stay intact.
- Every divider supports pointer dragging and keyboard resizing: left/right for columns, up/down for rows. Enter or double-click balances it; Home/End select ratio limits.
- Closing a pane or dragging its last tab into another pane lets its sibling fill the space. Closing a view does not delete its note, conversation or draft. Reopen restores closed views. **Undo layout change** reverses recent structural changes and sizing, independently of notebook edits.
- **Focus this pane** temporarily fills the workspace; **Show all panes** restores the arrangement. Reset returns to the original three columns after confirmation while keeping content.
- Tabs support arrows, Home and End. Pane menus provide alternatives to dragging. Narrow screens show one selected pane with a chooser for every pane in the layout.

The layout is a saved split tree, not a fixed set of slots. Its separate localStorage key is `lmbook-ux-lab-sketch-dock-v1`; malformed saved layouts fall back to the original sketch. Ratios, tab order, active tabs, closed tabs, focused pane and reading/search positions are retained. Layout undo holds the current session's last twenty changes; focus enlargement is temporary. Minimum dimensions keep controls usable; large arrangements scroll within the workspace instead of expanding the whole page.

Each view identity appears once; opening an existing view focuses/moves that instance. Different notes can remain visible simultaneously, with independent navigation and shared draft/save/conflict handling. Notes and Sources have unique input IDs when simultaneously visible. Source checkboxes change chat scope; note titles open working tabs. Citations activate Evidence wherever it lives. Pending demo answers live in shared provider state so moving the chat does not cancel an answer or overwrite a newer question draft.

## Evaluation and limits

Disposable Playwright workflows exercised the original three panes, nested horizontal/vertical splits, five simultaneous panes, pointer/keyboard sizing, temporary focus, closing panes to reclaim space, layout undo, restoration after reload and moving an unsaved note. Separate checks exercised actual edge dragging, grouping into a tab strip, menu relocation, reopening, dark mode and the 390px pane chooser. Screenshots of original, five-pane, dark and narrow arrangements were inspected. Completed runs reported no renderer exceptions. Evidence is in `.work/sketch-qa/` in the active worktree.

TypeScript/Vite and all 38 existing application tests passed during this work. No new formal tests were added. This is prototype behavior and visual evidence, not learner evaluation, live-provider verification, touch-device testing, native packaging or release approval. The ten earlier directions remain available.

The final runtime pass also verified a pending demo answer completing through a split, explicit cancellation without a late answer, reset to the original three panes and undoing that reset. These checks passed without renderer errors.

## Live Electron refinement — 2026-09-17

The owner rejected the tall notebook/help toolbars and outside margins. Direction 11 now uses a single 40px custom Electron title bar containing the notebook picker, preview identity, undo/reset and workspace menu beside the native window actions. The panes reach both side edges and the bottom edge. In-browser use gets the same compact top row without window controls. Help, design switching, settings, creation and demo status moved into the workspace menu. Larger nested arrangements scroll inside the workspace when their minimum usable sizes exceed the window.

The development entry `electron/preview.cjs` uses a separate `.work/live-preview/profile`, no backend and no vault/provider handlers. It accepts only a loopback development URL, keeps sandbox/context isolation enabled, denies new windows and permissions, and validates window-control IPC against the main frame. This is a live design preview, not automatic publication or an installed-release updater. The launcher is `scripts/dev-preview.mjs`; no new release artifact was produced.

A disposable Playwright Electron evaluation verified exact canvas bounds `(0,40)` to `(1500,940)`, real tab edge dragging, both pointer-resize axes, reload persistence, empty-pane reclamation and undo, custom maximize/restore, a live CSS edit appearing through HMR, and the narrow-window chooser without page overflow. Screenshots were inspected in light, dark and narrow states. No renderer errors occurred. Evidence: `.work/sketch-qa/electron-results.json` and `electron-*.png`. Browser-only checks additionally covered the 390px width. No new formal tests were added.
