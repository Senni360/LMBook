# Written review of the ten direction prompts

Date: 2026-09-17. Scope: prompt quality and consistency, before prototype implementation. This was an in-thread document review, not an independent agent review, usability study or visual inspection of new prototypes.

## Fidelity pass

All ten prompts repeat their own product context, fixtures, functional requirements, accessibility expectations and evaluation journeys. Each can be handed to a builder without the index or a shared preamble. They preserve Ink while varying how the whole app is organised. Each includes a distinct protected mechanism with a dedicated demonstration and failure handling.

Shared coverage includes new/existing notebook import, attached-versus-copied vaults, recoverable editing, explicit AI scope, historical citations, source-review uncertainty, reversible suggestions, the three automation modes, saved flashcard practice and direction switching, audio resumption, provider/local-model readiness and cancellable background activity. New AI experiences are labelled proposals and provider activity is simulated.

## Counterargument pass

| Candidate | Main risk considered | Constraint included in the prompt | Question for later critique |
| --- | --- | --- | --- |
| Balanced studio | Three visible regions crowd ordinary writing; evidence alignment temporarily changes a pane's role. | Collapse/reset controls, explicit comparison state and exact return to the previous layout. | Is the temporary role change understandable without a tour? |
| Focus-first studio | Hidden tools and three similar notions of history could make navigation harder. | Visible activity access; distinguish Back, Recent work and explicit Parked thoughts; avoid three permanent lists. | Can a newcomer locate practice and a parked question unaided? |
| Notebook tabs | Four destinations become silos; carried context might silently alter source selection. | Explicit context handoff and destination scope choice; preserved local task state. | Is the handoff strip useful without becoming a fifth destination? |
| Document-first | Annotations and draft alternatives overwhelm the margin; notebook-wide tools disappear. | One active margin task, accessible review list and direct global study entry points. | Can users tell a margin alternative from live shared-file text immediately? |
| Study-first | A study funnel sidelines writing; detours accidentally alter progress or playback. | Direct Notes access, one bounded detour and exact session restoration without mastery claims. | Is the return destination always obvious, including after restart? |
| Research-first | Evidence organisation becomes a compulsory form or creates false balance. | Optional workbench, no strength score, no requirement to fill limitation slots. | Does arranging evidence improve a consequential claim enough to justify the steps? |
| Outline-led notebook | Topics, files and questions become competing taxonomies. | Topics default, direct Files access, reversible question lens and one underlying object. | How much organisation effort is required before the structure helps? |
| Workspace tabs | Tab management becomes its own job; restoring a bundle rewinds files or restarts generation. | Two visible groups, searchable overflow, current-object references and no rerun on restore. | Are working sets understood as arrangements rather than duplicate notebooks? |
| Notebook overview | An orientation page adds a mandatory click and three competing queues. | Direct task links and one record shared by review, activity and change lens. | Does the change lens help intermittent users without adding notification anxiety? |
| Reading and learning split | Users mistake the visible paragraph for the AI's active scope. | Independently labelled learning anchor and exploration position; deliberate scope changes. | Are the two positions understandable without technical terminology? |

These risks remain hypotheses. The constraints mitigate them in the brief; actual usability is unresolved until the prototypes are observed.

## Corrections made during this writing pass

- Defined all twelve vocabulary fixture pairs and distinguished eleven supplied pairs from one generated draft. An incomplete source review remains separate from provenance.
- Fixed eight shared core note paths and suggestion identities so separate builders can use comparable material and state transitions.
- Added direction and protected-signature summaries at the top of every file so their identity is visible before the detailed common requirements.
- Explicitly separated prompt critique from later prototype evaluation. Written review does not establish task success.
- Clarified that candidate structures own the layout; the common feature list is not an instruction to create another permanent panel for every feature.
- Required real prototype state transitions through fixture adapters instead of success toasts that do not change anything.
- Distinguished the four context-preservation experiments: unfinished intent, in-session detour, multi-item working arrangement and concurrent reading/learning positions.

## Structural and behavioural limits

The document validation checks file count, unique protected IDs, nonempty direction-specific sections, required demonstrations, common fixtures and index links. It cannot judge whether the interfaces work. No application tests, provider requests, real-vault operations, new prototype screenshots or participant trials were performed for this documentation task.

The owner requested protected ideas to survive critique. Reviewers should still expose problems and improve the design around them. If a core problem cannot be resolved while preserving the mechanism, present the conflict to the owner; do not silently drop the mechanism or hide it in an unusable corner.
