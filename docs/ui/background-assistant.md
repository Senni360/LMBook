# Background connections and Jev experiments

Implemented 2026-09-16–17 for local Windows 0.3.15. This is a working slice of the accepted background-assistant direction, not completion of all ten proposed learning workflows or approval for 0.4.

## Where to use it

Open a notebook's Learn pane. **Note connections** contains assistant setup, proposed links and activity/undo. Choose the notes it may read, enable it, and select an edit-control mode. **Notebook checks** runs selected TypeSafe reviews. In **Connections & settings → TypeSafe Jev**, connect a key, check the connection and independently enable notebook checks, background link checks or search ranking. Jev connects directly to TypeSafe under the owner's revised provider direction; Luna continues through the Codex subscription. Features start disabled.

Connection checking sends an authored example, not notebook content. The key is kept in a separate local credentials file, never returned to the renderer or included in notebook exports/backups. Windows uses the current user's profile access protections; the file is not encrypted by this implementation. An environment key is supported and clearly distinguished from a saved key.

## Background links

- **Ask every time:** proposed additions wait for an explicit Add link action.
- **Automatic for straightforward links:** only a continuation to a uniquely named note already explicitly mentioned in the source can be added automatically. This inserts a neutral wikilink; more interpretive relationships wait for review.
- **Full control:** eligible explained links can be added without per-change approval. It remains bounded to selected notes, exact evidence, current file revisions and optional Jev checks. It does not authorize arbitrary file operations.

Luna proposes prerequisite, example, contrast, continuation or competing-explanation relationships with exact quotes from both notes. Code rejects unknown paths, self-links, missing quotes, existing links and duplicate proposals. Before writing, it rereads both revisions and rechecks the current mode, scope, enabled state and notebook existence. Apply/undo/dismiss serialize; the file publisher performs a final authorization check. Changes are append-only Markdown blocks. Undo removes precisely the recorded block and preserves unrelated later edits; edited blocks require manual handling. Vault history retains recovery copies.

Jev, when separately enabled, makes an advisory support judgment from the two quoted passages and proposed explanation. Automatic application requires its `supported` result and confidence at least 0.8. This is an experimental review threshold, not measured accuracy. A person may still accept an advisory-flagged proposal. No Jev outcome changes source verification. Unavailable checks leave automatic edits pending.

The scheduler runs while the app is open, prioritizes existing interactive jobs and handles one background run at a time. It checks up to 150 explicitly selected notes, the first 6,000 characters of each, in batches of five primary notes plus up to two related candidates. It is not an exhaustive all-pairs vault analysis. Fingerprints skip unchanged batches across restart, excluding its own appended blocks. Rejected suggestions remain dismissed for the same target revision. Provider errors back off; pausing cancels the active generation. Notifications are grouped, remembered and dismiss after 12 seconds; the review box and undo history remain available. Notifications appear for the open notebook, including when its Learn pane is collapsed, and on reopening a notebook with unseen results.

Trash preserves assistant history. Permanent removal cleans associated records without deleting original shared files. The UI refreshes note/source views after applied/undone changes. Unsaved edits still use the existing conflict/recovery flow.

## Jev notebook checks

Select up to 12 notebook sources, then choose any combination:

| Check | Actual decision and intended use |
| --- | --- |
| Classify sources | One role suggestion per source: explicit requirements/syllabus, teaching material, personal notes or unknown. Helps distinguish required coverage from supporting explanations. |
| Source relationships | Up to 12 explicit source pairs, prioritized by shared words: duplicate, complementary, possible contradiction or no established relationship. Suggestions help decide what to group or compare; they do not move or delete notes. |
| Learning goal | Whether these excerpts support a supplied goal as an explanation, calculation or application. This judges available material, never learner mastery. |
| Chat question | Whether the selected excerpts can answer a supplied unresolved question, fully, partly or not from this evidence. |
| Flashcards | One judgment for each of the first 12 cards in an explicitly chosen saved deck: supported, ambiguous, answer leak or unsupported from the selected excerpts. Original translations, cards and review status remain unchanged. |

Each source contributes at most its first 6,000 characters. Card sides are capped at 1,000 characters; only matching evidence from selected current passages is sent, not unselected historical deck snapshots. Long sources and larger decks are explicitly partial reviews. Up to 38 decisions are split into API batches of at most 32 questions. Valid option sets, bounded payloads and response schemas are checked locally.

Reports show the individual subject, model result, confidence, examined passages, coverage limits, latency and input-token usage. Helpful/not-helpful feedback persists per item. Reports become stale when the selected source or sampled deck content changes, including during a run. Cancel, disabled features, disconnected keys and removed notebooks prevent late publication. Reports are local experimental history; they are not yet included in portable notebook exports or backup restoration. The first 20 recent reports are shown. Nothing silently reclassifies course requirements or rewrites accepted learning material.

## Optional meaning-search ranking

After ordinary local/OpenRouter embedding retrieval, Jev can rank the top ten candidate excerpts (up to 1,800 characters each). Enabling this sends the query and those excerpts to TypeSafe even when the embedding index is local; Settings states that directly. All original candidates remain in the response. The five-second timeout, provider failures and disconnected key retain the original ordering with a visible notice. Query cancellation propagates; turning the feature off discards late ranking. A bounded five-minute cache avoids repeat calls. File revisions are checked again after the network step so changed passages are not presented as current matches.

## Height controls

Notebook navigation, note, details and learning cards have separately saved desktop heights. Assistant and Jev review boxes also have adjustable heights. Drag the lower edge, use Up/Down, Home/End, or double-click/Enter to reset. The existing horizontal dividers remain. Small layouts use natural content height instead of nested fixed-height panes.

## Observed evaluation

- Real Luna/Codex on authored Roman Republic notes produced two useful pending connections in 10.154 seconds in the initial ask-mode run; unrelated banana-bread text was excluded. Separate real runs exercised ask, straightforward and full modes, external-edit refusal and pause/cancellation.
- The actual browser interface applied a proposed link and undid it after a later external edit, retaining the external text and whitespace. Notification review, evidence, dismissal, height drag/keyboard/reset/persistence and light/dark layouts were exercised.
- Jev provider diagnostics used authored HTTP responses, not a real key. They covered authentication payloads, exact probability labels, malformed responses, cancellation and error redaction. A separate actual-route fixture covered 38 tasks split 32+6, source/card scope, missing input, feature disable, disconnection during a run, source staleness, feedback persistence/404 and purge cleanup.
- Search/link-check diagnostics covered caching, retained matches, timeout/error fallback, cancellation and late feature disable. A browser run connected an explicitly fake key to the mock transport, displayed 13 individually identified checks, saved feedback and exercised review-height controls. Layouts at 390/600/1,000 pixels had no document-wide horizontal overflow; screenshots were inspected, including dark mode. No renderer exceptions occurred in those runs.
- Existing 38 application tests, production/desktop builds and the packaged Windows startup/sandbox/persistence/restart smoke pass. No new formal automated tests were added. Ignored evaluation scripts/logs/captures are under `.work/assistant-evaluation`, `.work/assistant-mode-evaluation` and contributor evaluation folders in the main checkout.

## Still to establish

There was no owner Jev key in this environment: live authentication, latency, billing and semantic quality remain unverified. Mocked responses establish application behavior, not model competence. Before treating these experiments as reliable, connect the actual key, inspect representative Dutch/German/English material, collect ratings and compare judgments with manually reviewed evidence. No educational gains, probability calibration or general 3060-scale assistant performance have been measured. Jev is hosted and adds no local GPU checkpoint. Local E5 remains the existing retrieval baseline; it was not rebenchmarked here. Native macOS validation and owner acceptance remain pending.

Not implemented here: autonomous course maps, a durable unanswered-question watcher, source-change impact repair, learner modeling, session planning and automatic conversation-to-note preservation. The richer ten-direction specification remains the product destination. Research inspiration and limitations are in [early Jev applications](../research/jev-early-applications.md), and current model decisions are in [the model usage report](../research/background-assistant-model-usage.md).
