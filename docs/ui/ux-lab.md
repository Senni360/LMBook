# Switchable UX comparison lab

Implemented 2026-09-17 after the owner requested all ten directions in a switchable experience. This is an interactive comparison build, not ten replacement production interfaces. The original [standalone prompts](ux-directions/README.md) remain the broader design briefs.

## Open and compare

In the app built from this worktree, choose **Explore workspace designs** in the navigation footer, or **Open the UX comparison lab** in Appearance settings. Direct entry is `/?ux-lab=1`; numbers 1–11 select a direction. The comparison bar has a selector and previous/next controls. Ctrl+Alt+1 through Ctrl+Alt+9 selects those directions; Ctrl+Alt+0 selects 10.

For an isolated browser preview, run `npx vite --host 127.0.0.1 --port 5184 --strictPort` from this worktree, then open `http://127.0.0.1:5184/?ux-lab=1`. That Vite-only command serves the lab; the normal app requires its usual server. This work does not replace the installed desktop app or produce a new installer.

Expand **Try this direction’s idea** to exercise its protected interaction. **About this direction** explains the tradeoff. **Try an edge case** exposes simulated source changes, save/provider failures and cancellation. On narrow screens, use **Review & ideas** to reach the distinctive interaction.

| Direction | Working composition | Protected mechanism implemented |
| --- | --- | --- |
| 01 Balanced studio | Material, work and context together | Compare claim, source and editable correction; stage a note draft |
| 02 Focus first | Central task with optional supporting panes | Park and restore an unfinished thought with sources, question and reading position |
| 03 Notebook tabs | Activity destinations within a notebook sheet | Carry an explicit passage between activities without generating automatically |
| 04 Document first | Document with a working margin | Retain an alternative paragraph; handle changed originals; apply and undo |
| 05 Study first | Continue from a session overview | Take a contextual detour and return to the paused activity |
| 06 Research first | Source and working argument beside each other | Arrange supporting and limiting evidence, then insert a referenced argument draft |
| 07 Outline led | Topic or question navigation | View the same files through authored research questions, with paths to distinguish duplicate titles |
| 08 Workspace tabs | Closable note/activity tabs and optional split | Put away and restore a named working set, including layout proportions |
| 09 Notebook overview | Overview with on-demand context | Inspect source changes and mark them seen independently of accepting suggestions |
| 10 Reading and learning split | Independent reader and activity | Keep a source passage as a learning anchor while exploring other notes |

## Owner-drawn flexible workspace

Direction 11 adds the [owner’s customizable sketch](sketch-workspace.md): movable tabs, recursive splits on either axis, resizable dividers, pane focus, close/reopen, layout undo and saved arrangements. The ten original directions remain available.

## Shared behavior and isolation

The lab has 291 fictional notes, twelve editable German/Dutch pairs, an authored question/answer example, an 18-minute simulated lesson and review suggestions. Notes, unsaved drafts, source selection, practice, jobs and revisions are shared across designs; navigation, open panels and layout proportions are remembered per design. Switching designs does not regenerate material.

Implemented common interactions include title/path search, source selection, note editing, external-change recovery, source snapshot inspection, suggestion apply/dismiss/precise undo, reversible practice direction and typing mode, pair editing, playback position/speed, import into new or existing demo notebooks, cancelled/retried jobs, model readiness stages, dark mode, accents and keyboard/pointer pane resizing. Controls offer direct behavior rather than dead placeholders.

Demo state uses `lmbook-ux-lab-v1` and per-direction `lmbook-ux-lab-layout-N` localStorage keys. It is separate from real library storage. The lab makes no provider calls, downloads no models and accesses no vault folders. Ask answers, help and suggestions are authored simulations; audio transport has no actual recording. Assistant control selection is retained for comparison but does not run an autonomous agent. Indexed/downloaded indicators describe the simulated job sequence only. The UI labels these boundaries.

Existing normal-app state remains mounted when entering from the app. Hidden desktop chrome ignores keyboard menu and quit requests so the visible lab chrome handles them once. Direct lab entry skips mounting the normal app. The lab is lazy-loaded; its fixtures are not part of the initial application JavaScript chunk.

## Evaluation and remaining work

- Production TypeScript/Vite build passed. All 38 existing application tests passed; no new formal automated tests were written.
- Disposable Playwright evaluations covered all ten protected interactions, switch/reload persistence, note draft recovery, mixed activity tabs, Ask, practice answer hiding and direction clearing, playback advancing once per second, and keyboard pane sizing.
- Demo import checks passed for copying into a new notebook and attaching to an existing one. Simulated download completion prevents repeated downloading; runtime checking, enablement, indexing, cancellation and retry completed as expected.
- A final continuity pass verified unfinished comparison text across direction switches and reload. Inner split width now has its own state, so resizing the workspace does not resize navigation; keyboard horizontal and vertical resizing were exercised.
- An independent runtime review exercised all ten directions. It found hidden argument references and ambiguous duplicate note titles. Both were corrected by rendering all argument evidence and showing paths.
- Visual inspection covered all ten desktop layouts, light/dark controls and narrow layouts. At 1440×1000 and 390×844, switching all ten produced no renderer exceptions or horizontal document overflow. Dark input contrast and a mobile checkbox positioning defect were corrected.
- Mechanical Impeccable inspection identified the quotation accent border; it was replaced with a thin neutral quotation rule. Existing Ink typography and individual drawn control contours are intentional product choices.
- Disposable diagnostics and screenshots are in worktree `.work/ux-lab-qa/`; independent review evidence is in repository-root `.work/ux-lab-review/` and `.work/ux-lab-review-findings.md`. They are development artifacts, not a formal test suite.

No claim is made that these layouts have been evaluated with learners. Owner comparison and selection, real-data integration of the selected approach, screen-reader evaluation, physical gamepad use and native Mac/Windows packaging remain separate. No release version was changed or published. The remaining prompt details are design targets, not all implemented production capabilities; e.g. arbitrary split groups, general multi-document argument authoring and real asynchronous AI integration are outside this comparison build.
