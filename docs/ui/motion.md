# Purposeful motion in LMBook

The owner requested a full application sweep on 14 September 2026: plentiful, creative motion whose parts work together and each explain a real interaction. Their imaginary card-to-sidebar sequence illustrates coordinated choreography, not a requested interaction to copy. Preserve the existing reading-room identity and all learning behavior.

## Thesis

**Page, margin, bookmark.** A selection marker carries the current location; working surfaces arrive from the direction of travel; a source opens from its bound edge and its cited passage receives an ink-like emphasis. Controls acknowledge the action, the related surface responds, then its content settles. Ordinary reading stays still.

The focal sequence is opening an original source or following a citation: selected source → opening sheet → heading/content → located quotation. The sidebar example is not reproduced. Flashcards have their own single-face choreography: incoming question, deliberate answer reveal, grading feedback and progress. No outgoing answer is retained or cloned during navigation.

The owner's first visual review rejected the initial navigation: its marker moved right while the incoming surface moved left, with nested page/list/title movement making the conflict worse. That supersedes the initial visual sign-off. Direction must follow the user's selected destination: moving to a tab on the right moves the content right, and returning moves it left. The section surface and marker share one timing curve. Nested panels, headings and existing rows do not run independent arrival motions during navigation. List entrances are reserved for actual additions/filter changes after mounting. Source reveals share a downward axis; chapter titles acknowledge replacement without a sideways slide. Opening saved chat history does not replay new-message animations. Practice next/previous follows the same direction convention; reversal/shuffle does not imply travel through the ordered list.

## Implemented coverage

| Surface | Motion's job |
| --- | --- |
| Notebook rail and section tabs | Carry the selection marker, preserve list positions, communicate navigation direction. |
| Create dialog | Establish and release the temporary focus layer; retain native focus/Escape behavior. |
| Source imports, filtering and removal | Settle new/surviving rows into their actual positions; never suggest an upload succeeded early. |
| Source and historical readers | Bound-edge opening followed by heading/content and citation emphasis. |
| Goals and evidence | Reveal supporting passages and settle changing lists. |
| Audio studio and chapters | Explain chapter selection and disclosed configuration; transport activity only while actually playing. |
| Chat | Introduce a newly received response and its citations; leave existing messages still. |
| Flashcard generation and lists | Transfer attention from setup to the saved list; selection and autosave acknowledgment use actual state. |
| Flashcard practice | Coordinate direction, single visible face, reveal, typed feedback, progress and round completion without delaying input. |
| Settings and provider setup | Open details and acknowledge real saves/connections; preserve truthful errors and loading. |
| Trash, recovery and downloads | Reflow surviving entries, acknowledge results, keep cancellation immediately available. |
| Shared controls | Consistent press, hover, focus, selection, disabled, error and success feedback. |

## Implementation and budget

Use the existing React/CSS stack and Web Animations API; no motion dependency. Timing follows consequence: 120 ms press/acknowledgment, 180–240 ms routine changes, up to 360 ms for source/overlay choreography. Exits are shorter than entries. Staggers are bounded, with no wait imposed on reading or interaction. Motion helpers cancel prior animations; no timers own application state.

Measure only bounded lists, animate visible entries, and do not add perpetual scroll observers or idle decoration. Use transforms/opacity for travel, bounded clipping for sheet openings, and native details sizing with a static fallback. Playing indicators stop when paused, offscreen, hidden or reduced-motion is enabled. Respect live operating-system changes and offer a local reduced-motion preference. Default CSS remains visible if animation is unavailable.

## Evaluation

Exercise desktop, 390 px and intermediate widths; native Electron; keyboard focus and Escape; rapid repeated navigation; long lists; real failure/retry/cancel paths; autosave across navigation; source quote focus; audio interruption; both flashcard directions, typing and simulated controller input. Sample flashcard DOM/paint frames for hidden-answer leaks. Check reduced-motion changes during active sequences, background/offscreen loops, horizontal overflow, console errors and measured frame timing. Run existing application/build/desktop checks. Additional repository test writing remains deferred by the owner.

The isolated rehearsal used an explicitly illustrative notebook, 150 authored question/answer pairs, a saved illustrative chat/evidence passage and three audio chapters. Two chapters had locally authored silent PCM fixtures; one had no audio. No speech/model calls or owner-library changes were involved.

Observed browser checks:

- All five notebook sections at 390, 768 and 1440 px had zero horizontal document overflow, including changing sections. A 200% CSS zoom check also had zero overflow. Desktop and phone screenshots were inspected for reading order, wrapping and settled appearance.
- A navigation sample collected 28 animation frames with a maximum 17.8 ms frame gap, no overflow, and zero animations after settling. This measures one local Chromium run, not performance on a physical phone.
- Rapid reveal/next input across 25 cards produced 75 sampled frames with one question face, the correct next question and preserved focus. Direction reversal, keyboard reveal/navigation, simulated standard-controller navigation, wrong typed input and correct retry preserved existing study behavior. No old-answer DOM is retained for exit effects.
- Editing/filtering the 150-pair list remained usable. An injected HTTP 503 retained the edit and blocked practice with pending changes; Retry save persisted it successfully. Source review remained visible and independent of motion.
- Real playback of the silent fixture started the indicator. Pause, missing-audio chapter selection and scrolling the indicator out of view stopped its animations; offscreen playback itself continued.
- Local Reduce motion and a live OS preference change both resulted in zero active animations. Native dialog Escape restored focus to New notebook. Creating, trashing and restoring an isolated notebook succeeded.
- Following a citation focused the exact mark and brought it into view. The review exposed and fixed the previous parent scroll reset overriding a child's citation destination. Selection markers now measure resting row positions; this fixed a five-pixel offset after a row's arrival animation.
- No renderer exceptions were observed in successful runs. Some diagnostic selectors required correction for tab counts, nested labels and asynchronous navigation; those were harness issues.

After the owner's correction, five forward/back navigation samples confirmed matching marker/content direction and no independent descendant translations. Mounting the 150-row list initially produced 67–100 ms frame gaps. Native `content-visibility: auto` defers offscreen row layout while retaining the inputs and their draft hooks; the follow-up sample peaked at 16.8 ms. Filtering, editing and saving entry 150 passed, as did revised phone/intermediate/desktop overflow checks. The revised native package passed 45 additional single-face frames and the download/reduced-motion checks. These results describe behavior; the earlier claim of visually coherent navigation was withdrawn after the owner's feedback.

The one required Impeccable detector pass found only the two native progress-value width transitions. These are intentional narrow exceptions: the browser owns the progress element's value geometry and accessibility; changing its value is bounded to the existing bar and never changes surrounding layout. Disclosure sizing is similarly bounded and progressively enhanced. Travel and list movement use transforms. The scan is not evidence of visual quality or educational effectiveness.

New repository tests remain deferred. Existing tests/builds and packaged desktop results are recorded in WORKLOG.md. Physical controller hardware, other browser engines and learner evaluation were not exercised. Windows Electron/Chromium is the delivery target; older browsers fall back to immediate native disclosure/dialog state changes.
