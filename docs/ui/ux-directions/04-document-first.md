# LMBook UX direction 04: Document-first

Standalone implementation prompt. Prepared 2026-09-17. Status: candidate for critique; not a selected production redesign.

**Organising choice:** Documents as the home of tools and related learning.

**Protected signature — UX-04:** An editable margin draft beside unchanged prose. Preserve this mechanism during critique; its detailed requirements and demonstration appear below.

The direction-specific sections govern composition and navigation. Integrate the shared capabilities into that structure; do not add a permanent panel for each requirement.

## Assignment and boundaries

Build one complete, interactive LMBook UX prototype following this direction. It is one of ten candidates, not a skin switch inside a combined demo. Make it credible enough to evaluate as the eventual whole application. Preserve the Ink identity; change the navigation, information architecture and interaction mechanics as specified below. Do not collapse the direction into a generic dashboard or substitute a neighbouring candidate.

This file is a standalone build prompt. No shared preamble or companion file is required. If working inside the existing LMBook repository, inspect its product instructions, current components and design tokens before implementation. Build in an isolated prototype route, folder or worktree; preserve production behaviour, libraries and credentials. Do not migrate real vaults, call live providers, publish releases or replace the existing app as part of this prototype. If working outside the repository, produce a runnable prototype with instructions.

The owner requested ten strong candidates and one unconventional idea in each. The section marked **PROTECTED UNCONVENTIONAL IDEA** is an explicit owner requirement. Reviewers may refine its controls, language, discoverability and implementation. They must preserve its core behaviour and dedicated demonstration. Do not delete it, hide it behind an experimental flag, reduce it to static decoration or replace it with an ordinary interaction to make the review easier. Critique its risks honestly. If an accessibility or reliability problem cannot be resolved while retaining the behaviour, document the conflict for the owner rather than silently removing it. Protection is not a claim that the idea is already validated.

## Product truth and people

LMBook is a desktop learning and research app, with a reusable responsive web interface. People use it to read course material, maintain Markdown notes, ask source-grounded questions, practise vocabulary or concepts, and listen to detailed audio lessons. Some are new to these tools; some bring a large Obsidian vault. Dutch, English and German content must fit naturally.

A notebook and an attached Obsidian vault belong to one experience. Distinguish opening an existing folder in place from copying material into a new notebook. Explain that saving an attached note also changes the file Obsidian reads. Original sources, editable notes, generated interpretations and historical evidence are distinct objects. A renamed note retains its identity; a shared-file conflict cannot be solved by silently overwriting it.

The app can prepare suggestions and proposed edits in the background. Support the three chosen control modes: ask every time; apply straightforward changes and ask about harder ones; full control within the selected scope. For the prototype start with an explicitly labelled ask-every-time demonstration setting, not a new production default. Demonstrate the other modes in settings and activity history. Full control still has scope, revision checks and undo. Model confidence must never be shown as proof that a fact is correct.

Luna supplies generated explanations through the existing Codex/OpenAI connection. Optional Jev checks, OpenRouter services and local search belong in Connections settings, with concise explanations of where data goes. Do not place model names in primary learning navigation. Mock onboarding must distinguish connected, unavailable and offline states. Existing saved content remains accessible offline. Separate model downloaded, checked and enabled; show indexing separately. These are supporting settings, not a forced tour before browsing the prototype.

## Common evaluation material

Use this same fictional data contract so reviewers can compare interaction choices fairly:

- Notebook **Water and society**, a research project with an outline, eight authored core notes, two notes named `Definitions.md` in different folders, a PDF excerpt, a source recording transcript, two chats and an 18-minute lesson paused at **07:42**. Give each object a stable ID and revision.
- A **291-note** stress view with realistic nested paths and long titles. Extra fixture notes may be generated deterministically and labelled illustrative. They must be openable. Avoid hundreds of fully mounted editors and pretend search results that open nothing.
- A source passage: “In the pilot survey, 12 of 40 participating households reported moving after the reservoir opened.” A separate passage says the survey did not establish why they moved. An intentionally overbroad draft claim reads: “The reservoir displaced 30% of all households.” The review should expose the population and causality limitations, not simply certify or reject the whole topic.
- A pending link suggestion with quotes from both notes; a second uncertain suggestion; a dismissed suggestion; an already applied change with Undo; and a stale suggestion whose source was edited externally.
- An external note edit and an unsaved local edit to exercise three-way conflict review. Include one independent addition and one incompatible definition change. A deletion is intentional unless the user says otherwise.
- A second notebook **Duits — hoofdstuk 11–15**, with a saved editable deck containing these exact twelve fixture pairs: `die Entscheidung — de beslissing`; `die Erfahrung — de ervaring`; `der Unterschied — het verschil`; `die Voraussetzung — de voorwaarde`; `der Zusammenhang — het verband`; `die Entwicklung — de ontwikkeling`; `die Ursache — de oorzaak`; `die Folge — het gevolg`; `die Maßnahme — de maatregel`; `die Möglichkeit — de mogelijkheid`; `der Vergleich — de vergelijking`; `die Auswirkung — het effect`. The first eleven occur in the synthetic vocabulary source; the last is explicitly labelled a generated draft translation. The supplied pair `die Folge — het gevolg` has an incomplete pairing review. Preserve supplied wording exactly. Mark all material illustrative; it is not the owner's real idioom.
- A pending download, indexing progress, provider timeout, denied save and missing attachment. Trigger these from a discreet prototype scenario menu. Their simulated nature must be clear. Counters must match actual fixture state.

Use source excerpts long enough to test reading, and a note long enough to require scrolling. Include narrow panes, empty notebooks, long German words, diacritics, multiline titles and a mixed-language conversation. Avoid fake scientific results and fabricated learner-success metrics.

Use these eight core paths: `01 Questions/Research question.md`, `02 Methods/Pilot survey.md`, `02 Methods/Definitions.md`, `03 Findings/Relocation.md`, `03 Findings/Definitions.md`, `04 Discussion/Claim draft.md`, `04 Discussion/Open questions.md`, and `05 Learning/Study notes.md`. Put the survey quotation and the no-causality qualification in separate sources, and the overbroad claim in Claim draft. Keep the two Definitions notes meaningfully different: one describes survey membership; the other distinguishes reported moving from displacement. Put the long reading fixture in Relocation. All other text is openly fictional and should remain consistent with these excerpts.

Store suggestion state by identity: suggestion A is a supported contextual link awaiting review; B is uncertain; C is dismissed; D has been applied and can be undone; E was prepared against an older revision. Viewing a suggestion is not accepting it. Keep these identities consistent when the same suggestion appears in a note, notification and review list.

## Visual and interaction floor

Keep the Ink visual language: paper-like surfaces, charcoal text, stable subtly imperfect pen contours, restrained accent colour and precise reading typography. Offer light/dark/system and the existing accent choices. Drawn decoration must not reduce legibility, shift hit targets or change randomly on render. Reserve highlighting for a meaningful selection or state.

Composition should express this direction through density, reading width, grouping and focus. Do not create ten identical shells with different labels. Prefer clear headings and spacious text over framing every item as a card. The main task should remain identifiable when suggestions and background work exist.

Motion explains opening, closing, focus and relationships. Navigation direction must match the actual destination; do not slide every view from the same side. No animation may delay typing, save feedback, cancellation or concealment of a flashcard answer. Reduced motion preserves state changes without spatial movement.

All actions need accessible labels and visible keyboard focus. Provide keyboard/menu alternatives to dragging, hovering and selecting text. Controls should have comfortable targets; tiny decorative close marks need larger hit areas. Dialogs return focus to the invoking control. Close means close the view; delete/remove must be separately named. Save failure preserves the draft. Closing a live job's view does not silently cancel the job. Closing unsaved work must retain recoverable local state or offer a clear recovery choice.

Resizable panes and sizeable work surfaces need pointer and keyboard controls, sensible minimum sizes and reset. Honour the owner's interest in width and height adjustment without putting grips on every message or inline suggestion. Specify which boundaries resize below. At 1440×900 and 1280×800 maintain a useful reading column. At 1024×768 reduce peripheral UI. At 390×844 and 200% zoom preserve the same tasks through accessible sequential views; never squeeze desktop panes into unreadable columns. Avoid competing nested scroll regions.

## Functional requirements that every direction must retain

- **Getting started:** mock a concise account check, then create a notebook or connect a vault. Import can target a new or existing notebook. Show scope and completion; partial import is not complete import. No recurring onboarding for an existing library.
- **Notes and sources:** search, open, edit, save feedback, recover a draft, review an external change, create a file and export. Vault export and full LMBook backup are distinct. Prototype exports may use fixtures but cannot claim to include nonexistent files or recordings.
- **Ask and evidence:** show selected sources before sending, with select-all/clear-all and individual selection. Make clear whether the selection is passages, files or a whole notebook. Changing current scope affects future requests, not the evidence attached to earlier answers. Source citations reopen the actual examined snapshot with current-version differences visible.
- **Practice:** open an existing deck, edit the underlying pair list, switch language direction without generating again, choose flip or typing practice and retain controller mappings. Reset the visible face before advancing so the next answer cannot flash on screen. Practice remains available with clearly marked incomplete review. Concept cards and optional generated translations remain supported; generated translations are distinguishable and never replace supplied pairs silently.
- **Listen:** resume, seek, pause, change speed and open transcript/chapters. Show where contextual help belongs. If no playable demo audio is bundled, label transport behaviour as simulated. Never claim a real recording was generated. Generation preparation retains learning goals, source treatment and relevant settings; saved playback should not open a generation form first.
- **AI assistance:** give a discoverable home to link suggestions, claim evidence, argument review, source conflicts, contextual terminology, import cleanup, script rehearsal and audio help. These are proposed experiences, not claims that the production features already work. Use the same few interaction patterns for them. Each finding shows what was examined, uncertainty, proposed action and dismissal. Unavailable AI must not block ordinary editing or playback.
- **Background work and changes:** progress, Stop/Cancel, retry and completion belong somewhere consistent. A cancellation must prevent late results from silently appearing as accepted changes. Record automatic changes visibly. Undo should preserve unrelated subsequent edits; when a precise undo is impossible, offer a comparison instead of overwriting. Dismissed suggestions stay dismissed until meaningful new evidence, not simply a tab switch.

## Direction thesis and first impression

Make a document the natural centre of the notebook. Reading, thinking and writing happen in one generous surface; questions, evidence and learning material attach to it without becoming part of the Markdown unless the user saves them there. The workspace should feel useful even with AI disabled.

Show a readable note with a restrained toolbar, the folder path and a compact file tree. Related learning appears as a labelled document action, not a row of empty widgets. A fresh notebook offers Create note or Import material with a visible alternative to open an existing vault.

## Navigation, document tabs and state

- Use a file tree and closable document tabs. Single-click previews an unedited file in a reusable tab; editing, double-clicking or Keep open promotes it. Dirty content is never replaced by another preview.
- Notebook-level Ask, Practice and Listen remain directly available through a small labelled activity launcher. A user must not first open a note to access a saved deck or episode.
- Related items show their real identity: a conversation about a note, a deck derived from several sources, an episode with a historical source snapshot. Avoid implying that a multi-source artifact belongs exclusively to one file.
- Evidence and explanations open in one right margin panel. Opening a second detail replaces the panel's detail view with Back available, not another nested drawer. The panel can be widened or collapsed without moving the editor caret.
- The file tree and margin resize horizontally. An optional source/comparison area within the margin can resize vertically. On a narrow window show a document/detail switch with the selected passage and return action; preserve the editor's selection when the screen changes.

## Placement of features and routine workflows

Keep the note toolbar short: reading/editing mode, Ask about this, Review and Related learning, with file operations in a labelled menu. Selection actions are supplementary; the same commands must work from a paragraph menu and the toolbar without mouse selection.

Ask about this prepares a conversation with an explicit passage/file scope. It does not silently include the whole vault. Creating practice or audio prepares an editable draft with source and learning-goal choices before generation. Existing decks and recordings open into use, not setup. Import cleanup compares a formatted reading view against the preserved original.

Shared-file save state stays near the document title. Conflicts open a comparison with original/local/external identities clearly labelled. Keep unsaved local text recoverable while inspecting external content. Notebook export and full backup live in the notebook menu; model setup stays in Connections.

## AI suggestions, edits and background work

Use subtle anchored annotations with a plain-language Review list for accessibility and overview. A note can show a suggested link, uncertain claim or differing term meaning without inserting badges into every line. Group multiple findings on one passage into one entry.

Selecting a finding reveals its evidence and intended change in the margin. Dismissal removes that annotation; an accepted change updates its history. Automatic changes have inspectable before/after records and Undo. Notebook-wide suggestions remain in the review list, not scattered across every open tab. Background work appears in a compact status area under the file tree; save errors remain beside the editor.

## PROTECTED UNCONVENTIONAL IDEA — UX-04: a margin draft

**Core requirement:** let the user try an alternative paragraph in the margin while the actual note remains unchanged and readable next to it.

Offer **Try a revision** for a selected paragraph and for a proposed AI edit. Open an editable alternative aligned with the original passage. Label it clearly as a draft alternative, show the original revision it was based on, and allow the user to rewrite the proposal themselves. An AI candidate and a manually authored candidate use the same mechanism.

Only one margin draft is active per passage. Opening another draft must not discard the existing one; provide a compact list of saved alternatives rather than stacking full editors. Apply replaces only the intended passage after verifying its identity and revision. Keep original, Apply revision and Save alternative for later are explicit actions. The alternative is not written into the shared Markdown until applied or explicitly saved as a separate note.

If the underlying paragraph changes in Obsidian, freeze automatic application and show the original base, current text and alternative. Do not insert at an approximate offset or overwrite the whole file. A dismissed or closed margin editor retains a recoverable draft unless the user explicitly discards it. On a phone, present Original / Alternative views with clear labels and a preview before applying.

**Protected acceptance:** the original remains inspectable, the alternative is truly editable and no live note change occurs before Apply. A static diff or an AI-only Accept/Reject card does not satisfy this idea.

**Demonstration:** create a margin draft correcting the relocation claim, edit its wording yourself, close and reopen it, then apply and undo. Repeat after an external edit to that same paragraph. Show that changing an unrelated paragraph need not erase the staged work, while ambiguous anchors require review.

## Conflict checks and tradeoff to evaluate

Annotations and the margin draft must not compete for separate right-hand columns. The margin has one active task and a clear route back to review. Avoid the impression that every note needs AI polishing. This candidate should excel at thoughtful writing and source-based revision; evaluate whether notebook-wide study and multi-document comparison remain sufficiently discoverable.

## Required prototype delivery and evaluation

Deliver a runnable implementation, a short run guide and an honest behaviour inventory. Identify implemented interactions, simulated providers and remaining limitations. Keep data/state changes meaningful: a dismissed suggestion disappears, an accepted edit changes the note, Undo restores only that change, and a saved draft survives a reload when storage succeeds. A storage failure must show an unsaved/recovery state. Do not add production migrations or a new automated test suite; use existing checks where available and perform manual scenario evaluation.

Avoid building unrelated infrastructure to complete the prototype. Use a small deterministic fixture adapter for simulated filesystem changes, providers and jobs. Implement the navigation and state transitions faithfully; do not fake a successful save, cancelled job or export through a toast alone. Add a labelled reset-demo action that affects only prototype data. Source paragraphs and output drafts must remain selectable and readable rather than being painted into screenshots.

Provide screenshots of the initial notebook, note editing, evidence review, suggestion comparison, practice, audio and the protected unconventional idea. Inspect actual rendered output in light and dark modes and at desktop and narrow widths. Check focus visibility and reduced motion. Record what was actually checked; screenshots do not prove keyboard behaviour, real provider quality or educational benefit.

Run these common journeys without an explanatory tour:

1. Create a new notebook from selected vault notes, then distinguish its copied content from an attached shared folder.
2. Find the correct `Definitions.md`, edit it, leave and return, then recover from a simulated save failure and an external edit.
3. Ask about relocation using exactly two selected sources. Open a citation, inspect the qualification and return to the question with its draft and place intact.
4. Inspect, accept and undo a link; dismiss another; then attempt a stale proposal and show why it needs another review.
5. Open the saved German deck, switch direction, type an answer and advance repeatedly without revealing upcoming answers. Edit a pair and verify the new value is used without regeneration.
6. Resume the episode at 07:42, request help, inspect a source and resume from the intentional playback position.
7. Start indexing, keep using the notebook, cancel, then retry. Inspect the difference between installed, checked, enabled and indexed.
8. Perform the direction-specific protected-idea demonstration and its failure case. Repeat its essential action with keyboard-only input.

Judge this direction on task completion, discoverability, orientation, source-scope clarity, recovery, distraction and reading comfort. Record observed detours and state loss. Do not infer user approval or claim usability gains without participants. The unconventional idea passes only if it remains present, is understandable, solves its stated problem and has a usable fallback path. Its novelty alone is not success.

Finish with the strongest reason to choose this candidate, its most serious tradeoff, what evidence would change that recommendation and the next unresolved design question. Do not declare it the winner before comparing the other candidates.

## Research basis and limits

This is a product-specific design hypothesis. Its detailed mechanics have not been validated with LMBook users. General guidance informs the evaluation rather than proving the concept:

- [Nielsen Norman Group: usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — inspect consistency, visibility, recovery and familiar language.
- [Nielsen Norman Group: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — assess whether secondary controls remain discoverable.
- [W3C APG: tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) and [window splitters](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/) — consult for applicable keyboard and semantic behaviour; guidance does not replace testing the implementation with assistive technology.
