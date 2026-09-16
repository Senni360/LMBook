# Background organization assistant: comparator evidence

Research date: 2026-09-16

This note records primary product documentation that is relevant to a possible GPT-5.6 Luna background assistant for LMBook. It is evidence about interaction patterns and published product boundaries, not evidence that any vendor's model is reliable on LMBook's sources or that Luna can safely edit an arbitrary Obsidian vault. The sources are vendor documentation and product announcements; no independent usability study or live vault test was performed.

LMBook's constraints are unusually consequential: the same Markdown files must remain usable in Obsidian, generated interpretations must remain distinguishable from source-authoritative text, learners switch between Dutch and English, and long-form audio is often consumed while walking. The useful pattern is therefore quiet resurfacing and reviewable suggestions. A background process should earn permission to write through repeated, inspectable actions rather than assume it.

## 1. Resurface related context beside the note in progress

**Observed pattern.** Mem's Heads Up panel automatically surfaces related notes for an open or newly created note, including meeting timelines, topic bundles and related collections. It supports opening a result beside the current note and a broader “Find More” path. Mem explicitly describes the feature as low-friction and says it is not currently customizable. Capacities' Related Content similarly places the closest five related objects below the current object, with a side-panel expansion; it can be hidden or initially closed.

Sources: [Mem Heads Up](https://help.mem.ai/features/heads-up), [Capacities Related Content](https://docs.capacities.io/reference/related-content)

**Adapt for LMBook.** Add a small, collapsed-by-default “Related in this vault” section for the open Markdown note. Show a short list with the path, relationship reason and a direct open action. Rank explicit wikilinks/backlinks first, then shared tags/aliases, then semantic candidates. Keep the source note visible while opening a candidate in a split pane or temporary preview. A “Find more” action can invoke Luna when the local index is insufficient.

**Reject or limit.** Do not copy Mem's opaque, uncustomizable behavior. The user needs to distinguish “linked from this note,” “same goal/tag,” and “model-similar.” Never create a link merely because two notes scored similarly; present a suggestion with its evidence and require acceptance. Related results should never pull unselected vault content into a generation request.

**Observable acceptance.** With a note open, the user can see why each of up to five suggestions appeared, open one without losing the current draft, close the section, and turn semantic suggestions off. A suggestion never changes a Markdown file until explicitly accepted.

## 2. Separate fast retrieval from expensive semantic discovery

**Observed pattern.** Mem documents a three-tier search flow: title typeahead, submitted full results with filters and keyword matches, and an explicit Deep Search toggle for semantic matches. The semantic mode is therefore an escalation after ordinary retrieval, rather than an opaque replacement for it.

Source: [Mem Search](https://help.mem.ai/features/search)

**Adapt for LMBook.** Let the local vault index handle filename, alias, tag, wikilink and full-text matches immediately. Luna can add an explicit “Search by meaning” or “Find connections” action that runs only after the user asks, or on a deliberate idle schedule. Persist the query and returned paths so a related result can be inspected and cited later. Search results should expose a stable path and a content excerpt, not only a generated label.

**Reject or limit.** Do not call a model on every keystroke or treat semantic rank as proof of a relationship. Semantic search must show a model/index timestamp and tolerate stale results after an external Obsidian edit. A no-result answer should remain honest when the index is incomplete.

**Observable acceptance.** Typing a filename remains local and responsive. The model is visibly invoked only for the semantic action or an enabled background job; its results can be filtered back to exact matches and every result opens the source file at a known path.

## 3. Capture first, review later, and keep an inbox honest

**Observed pattern.** Capacities treats the daily note as an inbox for low-friction capture, then recommends a second review filter: decide whether an item is useful or interesting now, delete noise, turn commitments into tasks, and create or link structured objects only when the line has earned that treatment. It explicitly says that days can be empty or busy and recommends regular review rather than trying to classify everything at capture time.

Source: [Capacities Daily Notes](https://docs.capacities.io/reference/use-cases/daily-notes)

**Adapt for LMBook.** Give walking captures, short voice transcripts, learner observations and “do this next time” ideas a dated local inbox. Luna may propose a title, language, tags, goal link or destination folder, but it should leave the raw capture and provenance intact. A review queue can group suggestions by “likely task,” “candidate concept,” “possible source link” and “needs language check.” The learner can accept, edit, defer or discard each suggestion at a weekly or notebook review moment.

**Reject or limit.** Do not auto-file every transcript into a course folder. A spoken thought can be a temporary observation, a question, an exact quotation or a mistaken transcription. Moving it silently would make the shared Obsidian vault less trustworthy and would erase the distinction between learner intent and model interpretation.

**Observable acceptance.** A capture remains readable if Luna is disabled, unavailable or wrong. Every proposed move/tag/title has an explicit before/after preview and a one-click discard. The review queue reports what is waiting without interrupting reading or audio playback.

## 4. Make every external write a reviewable proposal

**Observed pattern.** Tana states that its AI can search keyword, semantic and document relationships, but creates, updates and deletes appear as proposals. Proposals show location/access information, can be edited before acceptance, support comparison with the original and version iteration, and report blocked, partial, stale, failed and completed states. Tana permits some background-created documents and meeting wrap-ups to auto-approve, while updates, deletes and space changes always require approval. Connected-service actions are also drafted for approval.

Sources: [Tana Working with AI](https://tana.inc/help/working-with-ai), [Tana Supertags](https://outliner.tana.inc/learn/features/supertags)

**Adapt for LMBook.** Model Luna's work as pending operations: add alias, add tag, suggest wikilink, create a generated study note, or add a goal reference. Show the target vault/path, the exact source snippets used, the language, and a diff against the current file. A batch can be accepted after row-level review, but each operation needs a stable status and conflict handling. Keep a local operation log so the user can reopen an abandoned review.

**Reject or limit.** Do not inherit Tana's more permissive auto-approval for a shared Obsidian folder. Another editor or Sync service can change the file between proposal and acceptance. LMBook should never silently rewrite existing prose, rename files, delete notes, or rewrite wikilinks. A failed or stale operation should stay visible with retry/refresh choices.

**Observable acceptance.** Accepting a proposal writes only the shown path and bytes, retains a recoverable previous version, and leaves the user at the same note. A changed file produces a stale warning and a new comparison rather than an overwrite. The proposal says whether it is learner-authored, source text, or AI-generated interpretation.

## 5. Let learning adaptation follow evidence of performance

**Observed pattern.** RemNote makes relationships explicit through references (`[[`, `++` or `@`) and a search popup that can link an existing bullet or create a new one. Its spaced-repetition guidance says learnable material must be broken into small chunks so the system can use precise feedback about what was remembered or forgotten. Its flashcard guidance distinguishes due practice from practicing all cards and uses review feedback to drive scheduling.

Sources: [RemNote References](https://help.remnote.com/en/articles/6030714-references), [RemNote Understanding Spaced Repetition](https://help.remnote.com/en/articles/9337171-understanding-spaced-repetition), [RemNote Flashcard Basics](https://help.remnote.com/en/articles/8663109-flashcard-basics)

**Adapt for LMBook.** Luna can use explicit learner goals, selected source snapshots and actual practice outcomes to suggest one next action: link a concept to a prerequisite, ask for a method-choice explanation in economics, or schedule a small review item. For economics, a useful suggestion is a worked “which calculation method applies?” contrast grounded in the learner's source, rather than another definition summary. For language study, link a German idiom to its supplied translation and show the original wording beside any proposed explanation.

**Reject or limit.** Do not infer a learner's goal from a single note and silently generate a large deck. Do not equate semantic similarity with mastery or use a model confidence score as a review schedule. Keep source selection, translation authority and card acceptance visible. A user can practice before every review is complete, but LMBook must preserve the status of unverified material.

**Observable acceptance.** A suggestion names the goal and source snapshot that justify it, asks for a small learner action, and records the learner's response or dismissal. The same source can support Dutch and English explanations without replacing the supplied German wording or translation.

## 6. Treat walking audio as a generated, source-bounded view

**Observed pattern.** Google describes NotebookLM as grounded in uploaded sources and offering citations and relevant quotes. Its Audio Overview turns selected documents into a downloadable two-host discussion for listening on the go. The early announcement warns that the audio is not comprehensive or objective, can contain inaccuracies, may take minutes for large notebooks and originally could not be interrupted. Later documentation says Audio Overviews are available in many languages and that non-English overviews were expanded to match the English depth, while still presenting them as summaries of notebook contents.

Sources: [NotebookLM Audio Overviews](https://blog.google/innovation-and-ai/products/notebooklm-audio-overviews/), [NotebookLM multilingual Audio and Video Overviews](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebook-lm-audio-video-overviews-more-languages-longer-content/), [NotebookLM research update](https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm/)

**Adapt for LMBook.** A background assistant may prepare a clearly labelled “walking pack” from the user's selected notes: a short outline, source paths/timestamps, a Dutch or English output choice, and optional two-person audio. It should surface source citations in the transcript and keep the original Markdown, source snapshots and generated script separately. A learner can ask for an economics methods drill, a German source-preserving reading, or a bilingual recap without changing the canonical note.

**Reject or limit.** Do not generate audio from the entire vault by default, and do not present a smooth conversation as a complete or authoritative account. The German idiom example requires the supplied wording and translation to remain authoritative; the agent may explain around it but must not “correct” it from a general language model. Language availability and quality are version- and provider-dependent, so Dutch/English support needs a real LMBook listening check rather than a vendor-language list.

**Observable acceptance.** Before generation, the user sees selected files, language, intended outcome and known limitations. During listening, a citation can lead back to the source snapshot, and the script says when it is paraphrasing. Stopping, retrying or revising the pack never mutates the original vault note.

## Implications for a Luna background agent

The comparator evidence supports feasibility for a local watcher/indexer plus a model-backed suggestion worker, but not an autonomous vault manager. The safe boundary is:

1. Index locally in the background with a visible status, file timestamp and scope. Use cheap path/link/tag/full-text signals first; schedule semantic work only when enabled or requested.
2. Keep an explicit agent profile containing name, purpose, notebook/goal scope, language preference, schedule and allowed operations. A “Luna” identity should explain what it is watching and what it can propose.
3. Write suggestions to a review queue or sidecar history before touching shared Markdown. Every proposed name, tag, link, goal association or generated note needs provenance and a diff.
4. Preserve a separation between source, learner-authored interpretation and Luna output. Link suggestions can point to Obsidian paths, but acceptance is the only moment that writes a wikilink or new note.
5. Prefer a few high-value prompts over a permanent stream: “three related notes,” “one unresolved prerequisite,” “one calculation-method drill,” or “one walking pack ready for review.” The user should be able to pause the worker without losing notes or pending work.

These are comparator-derived design hypotheses. They need manual evaluation with a real nested shared vault, Dutch/English materials, a source-authoritative German idiom, an economics calculation gap and a long walking session before becoming product requirements.

## Evidence limits and unresolved questions

- Mem, Tana and Capacities describe hosted products with their own indexes, permissions and model behavior. Their documentation does not establish safe bidirectional writes to an Obsidian vault.
- Vendor pages describe intended behavior, not error rates, learner gains or accessibility for LMBook's users. In particular, automatic related-note ranking and semantic search need false-positive review.
- NotebookLM's announcements span different releases. The 2024 audio limitations and 2025 multilingual update should be treated as versioned evidence, not a guarantee for another provider or future build.
- RemNote's spaced-repetition advice supports feedback-driven adaptation, but it does not validate an LMBook economics method-selection intervention or audio learning outcome.
- No source here supports silently changing note names, folders, aliases, links, translations or learning goals. Those remain user-reviewable operations for a shared vault.
