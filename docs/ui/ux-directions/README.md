# LMBook: ten complete UX direction prompts

Each numbered Markdown file is a standalone prompt. Give a builder one complete file; no shared preamble is required. These are alternative whole-app experiences using the established Ink identity, not ten themes to combine into one interface. All must handle the same core journeys well.

The owner requested detailed prompts with one clearly marked unconventional idea each, retained through later critique. Every file includes a **PROTECTED UNCONVENTIONAL IDEA** section, concrete behaviours, failure handling and a dedicated demonstration. Review may improve the mechanism and should challenge its usability. It must not silently remove the protected idea. Unresolved conflicts go back to the owner with reasons.

## Switchable implementation

All ten directions now have interactive prototypes in the [UX comparison lab](../ux-lab.md). Open it from the navigation footer or Appearance settings in a build of this worktree. The lab uses isolated fictional material with simulated AI/audio; it does not replace the ten prompts or claim full production implementation.

## Candidates

| # | Prompt | Primary organisation | Protected unconventional idea |
| --- | --- | --- | --- |
| 01 | [Balanced studio](01-balanced-studio.md) | Stable material / work / context panes | Evidence alignment across three panes |
| 02 | [Focus-first studio](02-focus-first-studio.md) | One central task with temporary supporting panels | Park an unfinished thought with its working context |
| 03 | [Notebook tabs](03-notebook-tabs.md) | Notes / Ask / Practice / Listen destinations | An explicit context handoff between activities |
| 04 | [Document-first](04-document-first.md) | Documents as the home of tools and related learning | An editable margin draft beside unchanged prose |
| 05 | [Study-first](05-study-first.md) | A clear next learning activity with sources nearby | A reversible learning detour within the active session |
| 06 | [Research-first](06-research-first.md) | Source comparison and a persistent working note | A claim shaped beside supporting and limiting evidence |
| 07 | [Outline-led notebook](07-outline-led-notebook.md) | Topics containing sources, notes and learning material | A reversible question-based lens over the topic outline |
| 08 | [Workspace tabs](08-workspace-tabs.md) | Mixed artifact tabs with controlled split views | Close and restore a named working set without freezing its files |
| 09 | [Notebook overview](09-notebook-overview.md) | A restrained orientation page leading to focused tasks | A temporary what-changed lens on the notebook itself |
| 10 | [Reading and learning split](10-reading-and-learning-split.md) | Material paired with a persistent learning activity | Separate the learning anchor from exploratory reading position |

## Comparison procedure

First critique the prompts themselves: inspect the proposed journeys, competing controls, omissions and protected-idea risks. Revise ambiguous instructions without deleting the protected behaviour. Do not claim actual usability from this written review. After a prompt is selected for prototyping, build and review that candidate independently against its brief. Keep the fictional data and common journeys consistent. The same visual identity and capability floor are intentional; structural and interaction differences should be visible without reading the title.

Review in three passes:

1. **Fidelity:** can every core task be completed, do sources and recovery remain honest, and is the protected mechanism functional? Separate prototype simulation from actual functionality.
2. **Counterarguments:** identify who would struggle, what becomes hidden, where choices conflict and whether the unconventional feature earns its place. Challenge optimistic assumptions. Retain the core idea while proposing corrections.
3. **Behaviour:** walk through the specified journeys on rendered screens, including a failure, narrow layout and keyboard-only use. Record actual observations. Do not invent user-study scores.

For each finding record the task, current behaviour, practical consequence, severity, evidence, proposed fix and whether it affects the protected idea. Give each candidate a strongest-use case and an honest tradeoff. Do not rank by visual novelty alone or reward candidates for hiding important controls.

Shared expectations intentionally repeat inside files so each can travel independently. The application itself has not been redesigned by this documentation task. No model calls, new tests, private-vault access or release changes are needed to use these prompts.

## Similar mechanisms that must stay distinct

- Direction 2 parks one unfinished question for later; direction 5 takes a short detour within an active study session; direction 8 closes/restores a multi-item working arrangement; direction 10 separates a live learning anchor from exploratory reading. Do not turn all four into the same saved-tab feature.
- Direction 1 aligns an existing claim, evidence and proposed change; direction 6 lets the writer arrange support and limitations while forming an argument. Neither is an automatic truth score.
- Direction 3 transfers explicit context between activities; direction 7 reorganises topic navigation through questions without moving files. Neither silently broadens AI scope.
- Direction 4 stages a local wording alternative before committing it; direction 9 highlights changes since a previous visit without reverting the notebook.

## Documentation evaluation

The prompts were checked for coverage, conflicting requirements, independent readability, distinct mechanisms and concrete failure cases. A structural check verifies ten files and their required sections. [Written review notes](REVIEW-NOTES.md) record the main counterarguments and unresolved questions. This is brief review, not evidence that prototypes have been built or tested with users. The next step is critique of the prompts, followed by separately scoped prototype work.
