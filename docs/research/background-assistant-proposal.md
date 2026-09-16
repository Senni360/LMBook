# A background assistant for LMBook

2026-09-16. All ten feature directions are now endorsed by the owner, with the autonomy and notification corrections recorded below. This is the accepted product direction and developing specification; no new background model behavior has been enabled.

## Owner decisions after reviewing the ten ideas

The owner's numbered response refers to the ten ideas in this document, which they quoted in full. It does not select ten model checkpoints from the separate small-model catalogue. All ten directions are accepted. The owner expressed particularly strong enthusiasm for the course map (2), context-appropriate sessions (9), and durable conversation notes (10), and explicitly endorsed practice improvement (8). This records emphasis, not a replacement implementation order or a claim of educational effectiveness.

Two corrections supersede the initial review policy:

- For links, additions and edits, provide three user-selectable modes: full control without per-change confirmation; automatic obvious changes with review for harder ones; and approval for every change. This applies consistently to assistant-authored changes across the enabled features, including Obsidian links and conversation-to-note additions, rather than only to a link button.
- Source-change assistance (6) must stay unobtrusive. Catch meaningful consequences without repeatedly notifying the learner or producing irrelevant review work.

The owner approved these capabilities and control choices, not an immediate switch of their current library into full control. The intended behavior below makes the modes concrete; precise boundaries for the middle mode and unselected-mode defaults remain design choices to evaluate.

The owner subsequently authorized using any of the researched small AI models if they help the current work and requested an after-work report of models used/not used and the reason for each. Choose models by the contribution they make to an accepted workflow, not by a quota of installations. Keep [the model usage report](background-assistant-model-usage.md) current and provide its completed-work summary at delivery. Research by Luna contributors is distinct from running a candidate inside LMBook; neither documentation nor an installed package proves that candidate inference or evaluation occurred.

The owner then made their existing RTX 3060 a required target, including projects like `D:\Downloads\PWS\vault`. Model selection must fit that machine through bounded processing, CPU fallbacks and selective hosted work where justified by cost; an upgrade is not the proposed solution. The concrete vault assessment and API cost comparison belong in [the 3060 feasibility report](vault-3060-feasibility.md). Do not claim the full application works at that scale merely because one model fits.

**Jev is excluded from implementation for now:** the owner explicitly reports no API access and says not to implement it yet. Use plain code and Luna for its proposed decision roles initially; add another specialist only for a demonstrated gap. Do not add a non-working Jev integration, sign-up dependency or hidden fallback to it. Revisit only after access changes.

## Provider routing — owner decision, 2026-09-16

Use the existing OpenAI subscription connection through Codex App Server for GPT-5.6 Luna. Use OpenRouter for all other hosted models selected for this assistant work. This supersedes the research recommendation to route Luna through OpenRouter or add direct specialist accounts. Local models remain local; this decision does not require moving local retrieval to an API or replacing existing speech integrations.

If a specialist is unavailable through OpenRouter, choose an adequate OpenRouter alternative or retain a local implementation; report any unresolved capability gap rather than silently adding a direct provider. Jev remains excluded. Subscription usage is subject to the connected account's limits; do not silently fall back to paid Luna API requests when those limits are reached. Earlier Luna API cost examples are comparisons, not the selected billing path.

Read-only code inspection confirms that `server/codex-app-server.ts` already checks the existing account and starts model-specific Codex threads. This records the selected routing policy, not a new OpenRouter integration or a fresh account/model access check. Availability research remains in [the router evidence](vault-api-cost-evidence.md#router-availability-follow-up--2026-09-16).

## Agent control modes

This section is the authoritative autonomy policy for this feature set and supersedes earlier statements that shared-file edits or conversation additions always require review. Existing source fidelity, generated-translation settings and truthful learning evidence remain applicable in every mode.

| Mode | Behavior | Concrete example |
| --- | --- | --- |
| **Full control** | Within the enabled notebook/vault scope, the agent applies links, additions and edits without asking for each one. Activity history and recovery remain available afterward. Harder semantic edits are not secretly forced back through an approval dialog. | A useful discussion produces a sourced addition to an existing note and appropriate links; the result appears in the note and the activity history. |
| **Automatic for straightforward changes** | Apply changes that satisfy narrow, inspectable rules; present the proposed difference for ambiguous or meaning-changing work. Do not equate the model claiming high confidence with a straightforward change. | Link an explicit concept mention to one unambiguous existing target; ask before asserting a disputed relationship or rewriting an explanation. |
| **Ask every time** | Prepare the actual proposed change, then obtain approval before applying it. A reviewed batch may contain several clearly listed changes; approval does not silently extend to later changes. | Show exactly which links and paragraphs will be added, with accept, edit and reject controls. |

Candidate rules for the middle mode: the current source revision still matches; destination and affected passage are unambiguous; the change follows an explicit source or an already accepted relationship; it does not alter an approved word pair, quotation, learning requirement or user-written explanation; and it does not duplicate an existing link or note. Semantic similarity alone is insufficient. New causal claims, competing destinations, changes to meaning and replacement of user prose go to review. These are proposed operational rules, not measured model reliability thresholds.

Read-only searches, indexes and disposable proposals are preparation, not persisted edits to the learner's material. The selected mode controls applying material changes; it should not turn routine background computation into a stream of permission questions. Mode changes take effect for pending writes as well as new jobs, so a job started in full control cannot finish silently after the learner switches to ask every time. Pause/disable and the current mode should be easy to find. A proposed initial default is Ask every time until the learner chooses; the owner has not selected a default.

Full control removes approval friction, not evidence checks. If source text does not establish an answer, the agent may preserve that uncertainty or leave an item unresolved without fabricating a result. If Obsidian or the learner changes the same file while a job is running, reread and replan against the latest revision; never overwrite unseen edits. Record before/after content, affected source revisions and the reason for each applied change. Undo must preserve newer external/user edits rather than restoring an old whole file over them. Full-control work should remain visible afterward without a confirmation step disguised as a notification.

The permission selection is bounded to the learning content and enabled locations. Connecting a vault does not implicitly select every folder for processing. It also does not establish a new spending allowance: paid generation continues under the separate generation/usage policy. Permanent deletion, plugin execution and external publication are not added to scope by this feature decision.

## Source changes without notification fatigue

The owner specifically requires this feature to avoid becoming annoying. Treat the following as implementation requirements:

- Coalesce repeated saves and compare meaningful content changes before asking Luna for impact. Formatting, equivalent heading moves or unchanged content should not produce repeated review items.
- Show the result beside the affected card, goal or source, with a consolidated notebook/activity view. Routine work should not create pop-ups, sounds or repeated global badges.
- Explain the actual consequence: for example, an answer changed, rather than merely announcing that a file was saved. Group related changes from one source into one useful update.
- Respect the selected control mode: full control repairs eligible material quietly and records the change; the middle mode batches difficult proposals; ask every time leaves actual changes pending review.
- Remember dismissal against the source revision and issue. Only materially different evidence should bring it back; opening the notebook again is not new evidence. Allow feature-specific muting and pausing.
- Retain historical answers, source snapshots and recordings. Prefer a focused correction or a revision for future use over regenerating the entire course or repeatedly prompting for new audio.

Observable success: a burst of saves produces one relevant impact assessment; cosmetic edits produce no learner interruption; a dismissed unchanged issue stays dismissed; and meaningful affected items are still discoverable. These are acceptance criteria, not results already observed.

## Recommendation

Yes: GPT-5.6 Luna is a credible candidate for many small, bounded jobs across LMBook. The useful product is an app that remembers context, prepares the next meaningful step and keeps its learning material coherent. A permanent unconstrained agent reading and rewriting the whole library would be costly to control and difficult to trust.

Use a local task queue triggered by meaningful events: a source finishes importing, the user saves a note, a practice session ends, or a reviewed source revision changes. Local code identifies the affected items; Luna handles interpretation and proposes structured changes; application code validates references, revisions and permitted operations. Interactive requests take priority. Coalesce repeated saves, reuse unchanged results, limit spending/usage, cancel obsolete work, and prevent generated edits from recursively triggering themselves. Desktop-only work pauses when the app is closed or offline and resumes from the durable queue; always-on service hosting is a separate product decision.

The official [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna) describes cost-sensitive, high-volume use and supports structured outputs and function calling. This makes it a sensible starting model, not evidence of its accuracy or latency on these jobs. LMBook's existing Codex App Server connection and its account limits must be evaluated separately from API availability/prices. No new API purchase or background allowance is assumed. Complex curriculum interpretation, nuanced contradictions and diagnostic feedback need representative evaluations and an explicit escalation policy; the small model should be able to abstain.

## What other apps demonstrate

- [Notion Custom Agents](https://www.notion.com/help/custom-agents) use configured events/schedules and scoped access. Adapt narrow triggers and activity history; avoid making the owner configure a workflow engine for everyday learning.
- [Readwise Ghostreader](https://docs.readwise.io/reader/guides/ghostreader/default-prompts) writes automatic summaries into document metadata. Its automatic tagging remains experimental and off by default. Adapt work appearing in the place it belongs, and avoid assuming that plausible tags justify reshaping someone's filing system.
- [Mem Heads Up](https://help.mem.ai/features/heads-up) surfaces related notes beside the open note. [Capacities Related Content](https://docs.capacities.io/reference/related-content) can be hidden or initially closed. Adapt timely resurfacing with an explanation and dismiss controls; relevance alone is not proof that two claims agree.
- [Tana proposals](https://tana.inc/help/working-with-ai) provide editable comparisons and explicit outcomes for changes. Some background creations can auto-approve while updates/deletes require review. Its documented version history is read-only, so merely copying a history screen would not give LMBook an actual undo mechanism.
- [RemNote's review model](https://help.remnote.com/en/articles/9337171-understanding-spaced-repetition) uses feedback about individual remembered/forgotten items. Adapt task-level evidence; do not infer understanding from time spent, listening completion or repeated exposure.

These are inspected vendor documentation patterns, not hands-on evaluations of those products or evidence that they improve LMBook learning. More detail and version limits: [comparator evidence](background-assistant-comparators.md).

## Ten ideas

### 1. Turn a pile of sources into a prepared notebook

After the learner selects a set of imports, propose an intelligible notebook title, identify the likely course/topic, distinguish syllabus, teaching material and personal notes, and suggest an existing notebook or a new one. For a history course pack, recognize that a requirements sheet determines required coverage while the other documents supply evidence. Keep the imported filenames intact and use readable display labels in LMBook.

Automatic names are appropriate for an untouched default title; once the learner edits a title, it is theirs. Ambiguous placement stays a choice rather than silently creating several notebooks. This saves a chain of setup decisions, not just typing a name. Success: the first usable notebook needs less correction and fewer setup steps, with no source silently omitted or misclassified as required.

### 2. A course map that stays connected to the requirements

Extract candidate learning goals from the syllabus and marking guidance, connect each to supporting passages, and distinguish explicit requirements from suggested prerequisites or enrichment. Reconcile newly uploaded requirements with the learner's accepted map using a small proposed change set.

For economics, separate explaining unemployment, selecting the relevant population, choosing a calculation, executing it and interpreting the result. A chapter titled unemployment is not enough to know which of these is assessed. Show missing support and ask only where a consequential ambiguity remains. This could become the shared basis for audio, practice and progress. Success: required goals remain traceable and stable; source coverage and demonstrated performance remain separate fields.

### 3. Obsidian links that explain the relationship

On a saved note, examine a bounded set of nearby notes and propose a few meaningful connections: prerequisite, example, contrast, continuation, or competing explanation. Each suggestion identifies both passages and explains why the relationship is useful. A Roman consuls note might link to a comparison of restraints on executive authority while explicitly preserving differences between periods.

The connection can be useful in LMBook before it becomes a permanent wikilink. Applying it follows the selected control mode above: automatic in full control, automatic only for straightforward cases in the middle mode, or reviewed in ask-every-time mode. Similar vocabulary alone should not create a link. Do not fill a vault with backlinks to every occurrence of a term. Success: users follow and retain useful links, with low correction and dismissal burden; file revisions are checked before writing.

### 4. Questions that can find their answers later

When a learner explicitly leaves a question unresolved, keep it attached to its topic and source context. When a relevant new source is imported, check whether it supplies an answer or a useful partial answer. Surface it when that notebook is next opened: "The notes you added address your question about why the reform failed."

Show the new evidence and what remains uncertain. Never mark the question resolved just because the model generated a response. This lets learning continue across weeks without requiring the learner to remember every open thread. Success: the resurfaced evidence answers a previously recorded question and the learner decides whether it is resolved. Routine unresolved questions should not produce notifications across the entire app.

### 5. A comparison of disagreements in the material

When relevant material is added, identify candidate disagreements with existing sources: incompatible numbers, different definitions, alternative causal accounts or exceptions to a rule. Compare dates, populations, context and qualifications before calling something a contradiction.

For history or politics, explain when two authors offer genuinely competing explanations and when they are discussing different periods. The learner can choose to preserve both perspectives in the next lesson. For a course-specific definition, keep the course convention explicit. This prevents polished summaries from blending incompatible claims. Success: each flagged disagreement has two inspectable passages; false alarms and missed qualifications are recorded. This is a higher-risk interpretation job and should abstain when the evidence is insufficient.

### 6. Keep derived learning material aware of source changes

When the learner accepts an updated vault source, trace which goals, flashcards, chat answers and audio passages depended on the changed text. Prepare a review plan: which items appear affected, why, and the smallest useful repair. Do not regenerate an entire course because a heading changed.

Preserve old sources alongside historical answers and recordings. A corrected fact can produce a reviewed replacement card or a clearly dated audio correction, while older material stays inspectable. Exact revision/reference checks belong to code; Luna assesses possible semantic impact. Success: known affected examples are caught, unrelated content is not rewritten, and no history disappears. The dependency infrastructure is valuable even without AI.

### 7. Remember the kind of help that was actually needed

After a practice answer or an explicit learner correction, propose a narrow, editable hypothesis: "This response explains the concept but may show difficulty choosing a method from a word problem." Associate it with the actual response and course, not a global label such as bad at economics. This job proposes an observation; the separate practice job below uses accepted observations rather than diagnosing the learner again.

Use accepted observations to prepare the next lesson: fewer repeated definitions, more comparisons between possible methods. Treat a wrong answer as uncertain evidence—it might reflect wording, language, arithmetic or a missing convention. Ask a short discriminating follow-up when it changes the teaching. Success requires an independent new task, not a more flattering dashboard or a model's self-rated confidence. This should extend the preparation research rather than silently replace the learner's own account.

### 8. A practice set that improves without multiplying cards

After review, identify duplicate prompts, missing required items, questions that reveal their own answers, and accepted learning observations worth a different practice format. Prepare targeted revisions to the existing practice set rather than another bulk deck. In history, a learner who recalls dates might next explain a sequence or distinguish two causes. In economics, practise method choice before a long calculation.

For the German idioom, the saved source pair remains canonical. Direction changes, typing and review scheduling use that same pair; AI must not substitute a more natural translation. Generated additions stay separate and respect the existing default-off missing-translation option. Code can prove equality to an approved extracted pair, but cannot prove arbitrary PDF extraction infallible. Success: useful practice coverage with fewer redundant items, traceable corrections, and no false claim of mastery from one direction of vocabulary recall.

### 9. Prepare a useful session for the time and setting

Let the learner choose something simple such as "25 minutes, walking" or "15 minutes, at my desk." In the background, assemble a proposed session from their accepted goals, unfinished questions, due practice and available material. Prefer existing reviewed audio where suitable; generate new paid audio only under the learner's chosen policy.

A walk can emphasize explanation and verbal retrieval, with a marked calculation exercise waiting for the desk. On return, preserve playback position, the question left open and the next concrete step. Do not infer a walk from surveillance or mistake listening completion for skill. Success: preparation feels shorter and the planned tasks fit the setting; learning value still needs actual listening and task evaluation.

### 10. Turn a useful learning conversation into durable notes

After a substantive exchange, prepare a short proposed addition to the appropriate Obsidian note: the question, the useful explanation, source links, and remaining uncertainty. Reuse an existing concept note when appropriate, instead of creating a new summary after every chat. Keep the learner's own explanation clearly distinct from quoted source material and model interpretation.

For example, the learner's explanation of why the Senate retained influence becomes a sourced section, rather than vanishing in chat history. A walking capture can enter the same flow once its transcript is checked. Validate the exact addition against the current file and preserve recovery/undo; whether the learner approves first follows the selected control mode. Full control must allow useful additions to be saved without mandatory review. Success: notes are revisited and useful; the vault grows in substance rather than accumulating repetitive AI prose.

## Cohesive behavior and practical limits

Do not add ten separate assistants or ten attention badges. Put results where the learner needs them: suggested title in the title field, missing goals in the goal map, relationship suggestions beside a note, and a source-change indicator on affected material. A small activity view answers what ran, which sources it used, what changed, and how to revert it. Dismissal should suppress an unchanged suggestion; meaningful new evidence may justify resurfacing it.

Use the three owner-requested control modes above consistently, including for accepted learning-goal updates and existing vault prose. The original always-review shared-file recommendation is superseded. Generated interpretations remain distinguishable from authoritative source material even when full control saves them automatically. Approval policy does not change whether an inference is true or whether source review is complete.

Scope is explicit per notebook/vault/folder, with exclusions. Do not send an entire connected vault to a provider merely because it is connected. Imported text is task data, never authority to change permissions or execute instructions. Model outputs use bounded structured proposals; application code checks exact IDs, source quotes, permitted operations and unchanged revisions. Exact matching, file writes, hashes, duplicate detection, scheduling arithmetic and rollback do not need an LLM.

Suggested implementation sequence: first the durable background queue, three-mode permission enforcement and activity/undo controls, then source intake (1), explained links (3) and quiet change impact (6). Develop the course map (2) with the existing learning preparation research. Questions that find later evidence (4) and conversation-to-notes (10) can use the same references; the owner's strong enthusiasm for (9–10) should remain visible in planning. Diagnostic adaptation and practice changes (7–8) need the strongest learner evaluation. Session planning (9) follows reliable mobile/listening continuity. Disagreement interpretation (5) must preserve inspectable evidence and uncertainty; it does not override full control with a mandatory approval gate.

This is an initial design recommendation, not a claim that every proposed behavior is already feasible at acceptable accuracy. Next evidence: representative real course material, source-preserving language examples, measured Luna job latency/usage, false-positive review, and learner correction burden. No new automated tests or production prompts were written for this discussion.
