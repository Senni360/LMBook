# Ink interaction refinement

Status: implemented and locally packaged as 0.3.7, 15 September 2026. Owner review of the revised experience remains the next product evaluation. The owner rejected the prior passes as insufficiently thought through. Passing builds and screenshots did not establish a coherent interaction language. They specifically identified unresponsive field hover, an inner focus rectangle in chat, inconsistent yellow highlighting, and liked the rotating create-plus. They authorized substantial iteration, removal of unsuccessful treatments, and research into the application's generic AI design habits.

## Interaction rules

| Situation | Response | Purpose |
| --- | --- | --- |
| Pointer enters an available control | A light pen trace follows its existing contour over 280ms | Show the target without implying selection |
| Pointer leaves before completion | Trace reverses from its current position | Avoid restarting or finishing an abandoned action |
| A writing field receives focus | The same outer contour strengthens and stays blue | Identify the field being edited, including keyboard focus |
| Chat receives focus | The composer is one writing surface; its textarea has no second border | Keep the editing boundary aligned with the visible object |
| A button receives keyboard focus | Strong pen contour remains until focus moves | Match the writing system while retaining clear focus |
| A notebook/tab becomes selected | Its existing blue selection remains independent of hover | Distinguish the current location from a possible destination |
| A marked section arrives | One short highlighter swipe behind its heading | Establish the section; typing/polling must not replay it |
| Create or disclosure controls are used | Plus turns; disclosure chevron follows its open state | Explain the action rather than move unrelated decoration |
| Checkbox/radio value changes | A short fill/check transition | Show the actual selected value |
| Motion is reduced | Immediate final state, no drawing or travel | Preserve every control, focus indicator and outcome |

The marker is tied to section/notebook arrival and visible headings, including a reopened create dialog. The reading surface stays still afterwards. Text, hit targets, form semantics, refs, validation and autosave remain native. Hidden inputs remain undecorated; file and range inputs retain their platform interaction. SVG decoration receives no pointer events or accessible name.

## Why the app felt generated

This is a diagnosis of the known implementation, not an authorship detector. Rounded corners, system fonts or standard controls are not evidence that a design is AI-generated.

Confirmed local causes: button-only SVG decoration left fields on the old focus system; theme selectors competed with old form borders; independently added animations disagreed about when to run; microcopy repeatedly narrated the product instead of naming the task. The shared styles also carried a gold focus rule from the earlier theme. The initial field experiment exposed a hidden contour behind the native input; visual inspection caught this even though its computed animation was running. Consolidated layer and border rules address that cause.

Selected changes: native controls share the pen geometry and state transitions; chat owns one outer contour; arrival owns heading highlights; familiar icons remain; promotional fragments and generic footer advice are removed or replaced by task labels. Source-review warnings, provenance, provider status and costs are functional information and remain.

Rejected approaches: remove all motion; make every label handwritten; animate each heading on every render; replay a full pen stroke on every click inside an already focused field; replace native form behavior with custom widgets; remove source-review information merely because it mentions AI. Each would undermine a confirmed preference or useful behavior.

## Research and limits

- [NN/g: AI Prototyping in Real Design Contexts](https://www.nngroup.com/articles/ai-prototyping/) evaluates a real profile-page redesign with broad, detailed and visual prompts. Detailed context improved fidelity, but grouping, spacing and hierarchy still needed judgment. This is a heuristic evaluation of particular tools/tasks, not proof about every model. It supports reviewing relationships and states rather than treating a plausible screenshot as completion.
- [Romero et al.: Usable but Conventional](https://arxiv.org/html/2605.15124v1) reports 92 computing/engineering students rating ten prototypes with UEQ-S in an online survey. Practical ratings were generally stronger than perceived originality across both human and generated examples; an AI prototype received the highest overall rating. That is counterevidence to treating AI authorship as the defect. One educational-planning scenario and a mostly male computing-student sample limit generalization. Prototype perception is not long-term use or learning effectiveness; familiar controls may be valuable. This supports preserving native affordances while putting personality into a consistent material vocabulary.
- [NN/g: The Custodial Era of UX](https://www.nngroup.com/articles/ai-ux-debt/) argues that generation can outpace evaluation and accumulate UX debt. This is practitioner analysis, not an experiment proving this app's cause. Its relevance is procedural: separate generation, critique, revision and behavioral evaluation, and remove unsuccessful additions.
- [GOV.UK: Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces) recommends direct task language and improving a confusing interaction before adding explanatory prose. We adopt that clarity, not government's complete visual style or tone. Repeated slogans and implementation jargon are poor substitutes for clear controls.
- [NN/g: The Role of Animation and Motion in UX](https://www.nngroup.com/articles/animation-purpose-ux/) describes feedback, state and spatial orientation as useful jobs for short motion, and explains why incidental motion distracts. This is design guidance rather than a measured optimum for LMBook. The owner's preference for a lively pen treatment remains authoritative; evaluate its repeated use rather than equating quietness with quality.

No source establishes that a particular animation improves learning, nor that avoiding popular motifs automatically produces a good interface. The owner's specific feedback, the actual rendered app and reproducible behavior are the relevant local evidence. The following checks evaluate implementation and usability states; they are not evidence of educational effectiveness.


## Evaluation and revisions

Reviewed rendered production views using an isolated authored library: chat with 20 citations, a 150-pair word list, generation controls, learning goals, settings, dialog focus and dark typing practice. No owner library or generation provider was used. Keyboard selection changed the native goals selector; retry returned to the typing field; disabled controls did not draw a hover trace. Hover interruption reversed from its partial stroke to the resting state. Navigation invoked one heading mark per arrival and typing did not replay it. Device reduced motion made the trace immediate, and forced colors restored native borders, focus outlines and checkbox/radio appearance.

Visual inspection found and resolved: field contours hidden behind native backgrounds; a nested Ask-button contour covering its text; radio controls inheriting text-field corners; paired labels drifting after native textarea resize; and inherited speed-control typography affecting a wrapped select. The chat message region previously pushed the writing surface below the desktop window. Desktop chat now fits the available height, with independently scrollable messages and a visible composer; smaller windows retain natural page flow. At 1440×1000 the checked composer ended near y=912. At 390/768/1440px sampled layouts had no document overflow. Dark typing feedback, mobile chat and goals, native resizing and autosave were inspected after corrections. Browser page-error collection remained empty. A final frame-by-frame check exposed a full-width highlight before the observer started its swipe. Establishing the starting mark in the layout effect removed that flash; the first sampled frame now begins at scaleX(0.03) and grows forward.

### Performance limits

The first implementation measured every mounted word field. Deferred geometry alone still mounted hundreds of empty SVGs. The revised implementation mounts field paths only when measured near the viewport, groups visibility by word row, and shares resize/visibility observers. Offscreen fields keep a normal native border until their contour is ready. No idle animation loop or randomized repaint is added.

In the final one-off comparison, 22 chat input-to-next-frame samples had medians of 9.2ms in the previous build and 8.7ms in the refinement. This small difference does not establish a speedup. Four 150-pair navigation runs recorded maximum frame intervals of 16.8–50ms before and 33.3–66.6ms after; both builds dropped frames, and list arrival is not guaranteed 60fps. The limited, noisy local sample supports retaining the typing performance but leaves long-list mount smoothness as a limitation. The eager, deferred-path, deferred-element and grouped-visibility observations are preserved in `.work/ink-interactions/`; visual polish is not a reason to conceal that cost.

Browser evidence and screenshots: `.work/ink-interactions/`. No new repository tests were written, following the owner's deferral. Source review remains explicitly incomplete for the authored list; practice is allowed under the owner's earlier decision.


## Local delivery

All 38 existing application tests and production/TypeScript build passed after the final first-frame correction. The packaged executable passed the existing isolated desktop startup, sandbox/private-backend, persistence and restart check. Eleven packaged renderer/backend/desktop/license/metadata entries match the source build, allowing the builder's metadata stripping. Installer, portable, SHA256SUMS and a short inspected interaction recording are under `release/0.3.7/`. Package evidence is in `.work/ink-interactions/package-checks.json`. No GitHub release or root-wide commit was made. The owner's running application and unrelated shared-checkout work were preserved.
