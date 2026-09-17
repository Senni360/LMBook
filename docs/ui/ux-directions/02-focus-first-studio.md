# LMBook UX direction 02: Focus-first studio

Standalone implementation prompt. Prepared 2026-09-17. Status: candidate for critique; not a selected production redesign.

**Organising choice:** One central task with temporary supporting panels.

**Protected signature — UX-02:** Park an unfinished thought with its working context. Preserve this mechanism during critique; its detailed requirements and demonstration appear below.

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

Build a calm workspace that gives one meaningful task most of the window. Navigation and assistance are always findable, but they do not compete with the document. Concentration is the organising principle; hiding everything is not.

Open an existing notebook to its last task with a compact notebook header, a visible material-browser button, a task switcher and one supporting-tools button. An empty notebook offers Add material and Create note. Do not begin with a dashboard, permanent multi-tab strip or floating AI chat bubble.

## Navigation, panels and state

- The left material browser is a drawer or optional docked panel. Opening a note closes a temporary drawer and restores focus to the content. A pinned browser remains until explicitly unpinned.
- The centre hosts one note, conversation, practice session or episode. A labelled Recent work switcher lists titles and types, with search and pinning. Back returns to the previous item and position. Closing the current view does not delete the artifact.
- The supporting panel opens on the right for evidence, explanations or review. Its title always names the object it concerns. Permit pinning it for side-by-side work; otherwise give it a clear close button. Do not open a second supporting panel over the first.
- Focus mode hides optional chrome and restores it exactly on exit. Keep a persistent, accessible Exit focus action. Escape first exits a transient menu or dialog, not the entire workspace unexpectedly.
- Docked panels resize horizontally. The central reading surface can expand vertically to the window; transcript/evidence splits have optional height control. Do not put bottom-edge grips on every paragraph. At narrow widths a supporting view replaces the content temporarily and offers a labelled return to the exact task.

## Placement of features and routine workflows

A compact notebook action menu contains Create, Import, Export and Settings with descriptive labels. The visible task switcher exposes Notes, Ask, Practice and Listen; discovering core features cannot depend on a keyboard shortcut. Source selection sits adjacent to the composer or generation action and remains visible in focus mode when consequential.

Practice and listening open directly into existing material. Editing a deck is a distinct action that returns to the same session. A minimal audio transport can remain while the user reads, without obscuring the bottom of the page. The right panel can explain a passage, show claim evidence, review an argument or present an edit comparison using one consistent arrangement.

## AI suggestions, edits and background work

Show a small labelled suggestion marker near affected content only when there is something specific to review. Include the same suggestions in the document's Review action for keyboard and screen-reader access. Opening one uses the supporting panel; applying or dismissing it returns focus to the relevant passage.

Notebook-wide suggestions live behind one quiet Review count, not an animated feed. Routine background progress appears in a compact header status; detailed jobs open a temporary sheet. Save failures appear where the user is writing. A completed check does not automatically pull the user out of focus mode. The review panel preserves an unfinished human comment when another result arrives.

## PROTECTED UNCONVENTIONAL IDEA — UX-02: park this thought

**Core requirement:** let the user set aside one unfinished line of thought without keeping a distracting workspace open or losing the reason they wanted to return.

Provide **Park this thought** in the current task menu and near an unfinished question. It creates a compact local ticket containing an optional user-written question, object identity, anchor, selected sources, view position and a reference to recoverable draft state. Offer a useful title from the selected text or item name without requiring an AI call. An empty optional question must not block parking.

Parking returns the user to their previous task or notebook start. A quiet Parked thoughts entry lists tickets; no timed reminders or automatic resurfacing. Reopening a ticket presents its question and restores the relevant context. Source scope restoration is explicit and labelled; it must not alter a different conversation's future scope or accepted evidence. If the source changed, preserve the old anchor as historical context and invite the user to inspect the current version.

Tickets are references with saved intent, not duplicate notes or a second file tree. Completing or removing a ticket does not delete its underlying work. Renamed notes remain locatable by identity. Draft persistence failure must prevent a misleading Parked confirmation and offer copy/retry recovery. Provide keyboard creation, browsing and removal.

**Protected acceptance:** the unfinished question survives; the reading/draft context is recoverable; parking reduces visible working clutter. A generic bookmark to the file alone is insufficient.

**Demonstration:** start a source-grounded question midway through a long note, park it, practise German, then return to the exact unfinished thought. Repeat after the referenced source is edited and after storage fails.

## Conflict checks and tradeoff to evaluate

Keep Recent work, Back and Parked thoughts distinct: recent is visited objects, Back is navigation, parked is explicit unfinished intent. Avoid three competing permanent lists. Test whether their labels are understandable without a tour. The candidate succeeds when users can concentrate and still find every core tool; it fails if reduced chrome produces repeated searching for basic actions.

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
