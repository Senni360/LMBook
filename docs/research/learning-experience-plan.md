# Learning experience and prompting research plan

Created: 2026-09-14.

Status: the focused evidence review, candidate conversation, alternative comparison, and constructed-scenario inspection are complete for the first research pass. See [findings and decision memo](learning-experience-findings.md), [candidate conversation](learner-interview.md), and [learning-study evidence](learning-evidence.md). Real course-pack evaluation, learner rehearsals, comparative episodes, and learning checks remain outstanding. The candidate is ready for rehearsal, not specified as a validated production prompt or feature.

## Purpose

Work out how LMBook can establish what a learner needs and turn their materials into useful, detailed audio. This workstream concerns the learning experience, questioning, subject guidance, and how to judge results. Architecture, model selection, and visual styling are separate workstreams unless a learning decision genuinely depends on them.

The owner requests a well-researched and evaluated questioning process, with completion judged by its outcome. Their "ten hours" example conveyed willingness to invest effort; it was not a minimum, maximum, deadline, or duration commitment. An earlier version of this plan incorrectly made it a requirement. Estimate the actual work, revise that estimate as uncertainty changes, and use the readiness criteria below to judge progress. The first substantive review is recorded separately from the still-needed learner evaluation; no particular number of hours is owed.

## What we know from the owner

These are user reports and priorities, not general claims about all learners.

- The primary audience is the owner and friends. The owner accepts investing time in preparation when it improves recurring learning value; broad adoption is not the deciding priority.
- Politics is primarily a personal interest. History also includes school requirements. Subject and purpose are separate: any subject may be explored freely or studied against requirements.
- Sources may be uploaded in bulk. A syllabus or other required-learning document should be distinguishable from the supporting sources. Requirements establish minimum coverage and may need clarification.
- In economics, the owner can understand a term such as GDP or unemployment while being unable to choose and carry out the associated calculation. The reported roughly 60% numerical / 40% written split describes their coursework, not economics universally.
- Numerical teaching needs to connect the question to the appropriate relationship or formula, identify the relevant data, explain the calculation, and interpret the result. More explanation of a definition alone may miss the problem.
- Listening while walking is important. Optional equations, images, graph changes, or short animations are possibilities to investigate. Their benefit has not been demonstrated for this audience.
- Biology remains open pending other learners' perspectives. Do not turn provisional suggestions into settled requirements for them.
- The owner wants a research-oriented questioning process inspired by Matt Pocock's "grill me": uncover assumptions and misunderstandings before creating an audio overview.
- Clarification: the preferred starting structure is approximately five required standard questions, with additional questions when answers expose consequential ambiguity. The earlier assistant framing of a mandatory long interview overstated the request. Research should refine this structure and test its effectiveness; a shorter comparator is an evaluation tool, not authorization to remove required preparation.
- The owner endorsed the five starting areas proposed in the conversation: intended outcome, required coverage, treatment of the source, starting knowledge, and needed assistance. Keep these as the working structure while investigating wording and follow-ups. The timing clarification does not withdraw that endorsement.
- The system should actively elicit consequential preferences that a learner may forget or omit when rushing. A generic request to create an overview is not enough to assume summarisation, selective coverage, or freedom to rewrite original wording.
- The owner explicitly welcomes disagreement. Their initial solution is a proposal to examine, and a clear final override settles a choice. The collaboration rules live in [AGENTS.md](../../AGENTS.md).

## Concrete cases supplied by the owner

| Case | Intended experience | Failure the interview must catch |
| --- | --- | --- |
| Past German-literature course with stories, concepts, and other material in one large document | An annotated reading preserving the original wording and all requested material, pausing at appropriate points for context and explanation | Summarising the stories, dropping details, or replacing the original with a detailed paraphrase because the request was interpreted as a conventional overview |
| Roman-Empire history chapter with a separate list of required terms and ideas | Explain the relevant culture, behaviour, politics, and other specified material so the learner can meet the stated requirements | Reading every passage mechanically or producing a general Roman-Empire episode without establishing and covering the supplied requirements |
| Economics concepts such as GDP and unemployment | Help the learner select and perform the calculation as well as understand the concept | Treating familiarity with the definition as evidence that numerical instruction can be skipped |

These are reported learning situations; the original documents and assessment tasks have not been supplied or evaluated. The German-literature example describes the desired treatment of source material, not an implemented language feature.

Distinguish three decisions: **coverage** (which material must be included), **fidelity** (whether original wording must be preserved), and **learning task** (what the listener needs to understand or do). "Cover every idea" and "read every word" are different commitments. Subject labels and a depth setting cannot settle these decisions on their own.

When faithful reading is selected, proposed explanatory additions must be distinguishable from the original. Where added context may come from, what can be omitted, and how to handle unclear text are follow-up decisions to investigate. If complete coverage conflicts with a requested duration, expose the conflict and discuss duration or multiple episodes instead of silently compressing material. Generic stylistic defaults must accommodate the established learning brief.

## Working hypotheses to challenge

| Proposal | Intended benefit | Alternative or risk to investigate |
| --- | --- | --- |
| Start with about five required questions, then follow up selectively | Catch omitted needs and establish the intended treatment of the material | Poorly chosen questions may still miss fidelity or coverage; fixed wording may repeat known information or overlook ambiguities |
| Reuse a learner or course brief | Preserve answers and avoid repetitive setup | Knowledge, goals, and source material change; identify what must be checked again |
| Ask about prior knowledge | Match explanations to the learner | Self-reported familiarity may not reveal difficulty choosing a calculation; consider small examples without turning setup into an exam |
| Group politics and history together | Share methods for evaluating arguments and evidence | Chronology, historical perspective, normative claims, and causal explanation may require separate subject guidance |
| Link subjects and sources before generation | Make connections useful and support deeper explanations | Superficial associations and unsupported causal links can create misleading coherence |
| Add visuals to numerical audio | Make quantities and graph changes easier to follow | Visual dependence may interrupt a walk; compare optional stills, staged diagrams, and audio alone |
| Borrow N.A.G.'s composable prompt approach | Separate the analysis task from its presentation | A universal fixed sequence may fit some material poorly; compare with subject-specific guidance |

Research should be able to reject or substantially change any of these proposals. Preserve the user's underlying need when recommending a different means of meeting it.

## Decisions the research must resolve

1. What must an episode brief establish: intended outcome, subject scope, prior knowledge, required material, learning difficulty, evidence boundaries, and listening circumstances? Which fields actually change the lesson?
2. Which answers can be proposed from the syllabus and sources, and which require the learner? How will explicit requirements be distinguished from inferred ones?
3. How should questions adapt to uncertainty, contradictory answers, mixed knowledge, unclear goals, or a learner who says "I don't know"?
4. Which five core questions best establish the brief, and when should follow-up questioning stop? Examine unresolved consequential ambiguity, the learner's ability to correct a summary, and readiness to proceed. Completing five questions is not sufficient when a consequential answer remains unclear.
5. What needs revisiting for a returning learner, a new topic in the same course, changed goals, or new sources? What is the role of pausing and resuming preparation?
6. How can preparation distinguish understanding a definition, choosing a method, performing a calculation, interpreting a result, and transferring the method to a differently worded problem?
7. What teaching should be shared across subjects, and where do politics, history, economics, and eventually biology require different treatment?
8. How will source gaps, conflicting accounts, and material outside the syllabus affect the brief and episode? How can useful exploration coexist with required coverage?
9. Which parts of numerical learning work during a walk, and which should invite a later look or practice attempt? Avoid promising calculation mastery from passive listening.
10. How will we establish that questioning improved the outcome, and what result would lead us to shorten or remove a question?

## Investigation and completion evidence

Investigate the highest-consequence uncertainties first. Revisit stages as findings require. Participant scheduling and delayed learning checks may extend elapsed time independently of active work. Neither a stage allocation nor elapsed time establishes completion.

| Stage | Work and completion evidence |
| --- | --- |
| 1. Needs and failure examples | Reconstruct the learner journey from this conversation. Define concrete failures and missing evidence. Separate owner reports, assumptions, and questions for friends. Produce a needs map and draft success criteria. |
| 2. Learning research | Investigate primary research on prior-knowledge diagnosis, worked examples, self-explanation, retrieval and transfer, cognitive load in spoken numerical explanations, and complementary visuals. Record findings, contrary results, study context, and limits of applying them to walking and this audience. Prioritise findings that can change the interview or evaluation. |
| 3. Existing approaches | Examine the actual "grill me" workflow, N.A.G., and relevant learner-intake examples. Separate documented behavior and direct observation from promotional claims. Produce an adaptation/rejection rationale. |
| 4. Conversation alternatives | Develop candidate flows for a first episode and returning learner. Compare wording, follow-up logic, source-assisted preparation, and brief reuse within the working five-area structure. For every question, record what teaching decision its answer changes. These are research prototypes, not adopted production prompts. |
| 5. Scenario evaluation | Walk through ambiguous and contradictory inputs, numerical-learning cases, and history/politics cases. Where real participants and materials are available, observe actual preparation and subsequent learning tasks. Otherwise label work as scenario inspection and leave participant-dependent criteria open. Produce findings and revised candidates. |
| 6. Challenge and synthesis | Seek evidence against the preferred approach, check fidelity to user needs, identify avoidable burdens, and compare learning value with preparation effort. Produce a decision memo, remaining uncertainties, and a justified recommendation for the next stage. |

## Provisional effort estimate and its basis

These are the assistant's original scoping estimates as of 2026-09-14, not published development benchmarks, promises, required durations, or measured work. The review and first candidate/scenario pass below have now been completed; their estimates are retained as planning history, not claimed research hours. Active effort across parallel research was not measured. Remaining participant and analysis estimates need revision once actual material and participation are available; they do not establish a completion date for the full learning experience.

| Deliverable | Initial planning estimate | Scope and assumptions |
| --- | --- | --- |
| Focused research review and synthesis | About 2–4 hours of active work | Resolve the interview's consequential design questions using relevant studies and existing approaches. Build on the user examples and known five-area structure. This is a focused review, not a systematic review of every relevant educational field. |
| First candidate conversation and scenario checks | About 1–3 additional hours | Prepare wording and follow-ups, check the three supplied cases plus ambiguous answers, and challenge the preferred solution. Excludes production implementation and all final subject prompts. |
| Initial participant session | Provisionally 30–60 minutes per learner | Inspect preparation and a bounded learning task. Full-length listening and delayed checks may require separate sessions. Availability determines calendar time. |
| Analysis and revision of a small round | About 1–2 additional hours initially | Consolidate observations and revise the candidate. Expand the work if failures require redesign or additional evidence. |

The research estimate reflects existing literature and a bounded decision problem; it does not assume knowledge can be copied from a guide directly into a successful product. Revise the range after identifying the evidence that matters, its accessibility, and material disagreements. A validated complete learning experience cannot yet be assigned a responsible fixed total; participant feedback, actual episodes, and further iterations are unresolved dependencies.

External guidance used to scope the work:

- [GOV.UK: planning user research](https://www.gov.uk/service-manual/user-research/plan-user-research-for-your-service) recommends defining research questions, examining assumptions, selecting methods that answer them efficiently, and adding rounds as findings require. It supports the approach, not the hour estimates above.
- [GOV.UK: moderated usability testing](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing) gives 30–60 minutes as a usual usability-session duration and emphasises realistic, non-leading tasks. That is a reference for initial preparation testing, not evidence that a learning-effectiveness trial fits in one session.
- [IES: Organizing Instruction and Study to Improve Student Learning](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) provides an existing evidence synthesis covering worked examples, problem solving, graphics with verbal descriptions, and explanatory questions. At scoping, only its recommendations page was inspected. Selected primary studies and newer counterevidence have subsequently been reviewed in [the learning evidence memo](learning-evidence.md); the full guide and its entire evidence base have not been comprehensively audited. It supplies no estimate of this project's duration.

Use an estimate to organise work and decide when to reassess. Continue when findings expose consequential gaps; stop a line of investigation when further reading is unlikely to change the decision and the stated evidence needs are met. Report actual effort only when measured; distinguish overlapping work and waiting from sequential active time.

## Evidence standard

Use original studies, accessible author manuscripts, official curricula and assessment criteria, and direct product/workflow documentation where relevant. Use reviews to find primary studies and map disagreements; mark review-level conclusions appropriately. Inspect methods and outcomes, not only titles or abstracts. Label inaccessible evidence and avoid claiming it was fully assessed.

For each consequential claim record the source, date, population/task, finding, limitation, and implication for LMBook. Search for disconfirming results. Distinguish an established finding from our inference about this product. Keep source-grounded learning research separate from personal preferences about tone or enjoyment.

Verify economics examples against the actual course conventions when available. GDP questions can ask for different quantities or methods, and unemployment questions require clear definitions of the relevant population. Do not choose a teaching formula merely from the topic label. This plan does not supply a worked lesson or an assumed syllabus.

N.A.G. is a reference for prompt composition, not evidence that its prompts improve learning. The repository review found no license file; any reuse of its text needs a licensing check. Original LMBook instructions can express independently developed choices.

## Evaluation before adoption

Begin with the actual complaint: an episode can sound clear while leaving the listener unable to answer the kind of question they encounter in class.

Compare at least a minimal-preparation baseline with the best candidate interview on matched topics and source quality. Inspect a longer alternative when it tests a real hypothesis. Give the baseline reasonable information rather than constructing an artificially weak comparison. Keep model, source material, and episode length comparable when attributing differences to the interview. Track added source information as a separate factor.

Use parallel questions of comparable difficulty rather than repeating a just-taught answer. Alternate order where feasible and record prior familiarity. A small owner/friends pilot is exploratory; it cannot establish a general effect size or justify a numerical improvement claim.

| Dimension | Evidence to collect |
| --- | --- |
| Preparation value | Misunderstandings uncovered, unanswered consequential questions, correctness of the final brief, repetitions, effort, and willingness to use the process again |
| Economic performance | Choosing a suitable method, identifying relevant quantities, carrying out steps, units, interpreting the answer, and attempting a new problem |
| Historical understanding | Explaining sequence and causation, retaining qualifications, and distinguishing source accounts from later interpretation |
| Political understanding | Explaining mechanisms and assumptions, representing disagreement accurately, and separating empirical from normative claims |
| Source fidelity | Traceable support, missing evidence, fabricated links or quotations, and whether stated requirements receive substantive coverage; for annotated reading, preservation of the original wording and sequence, omissions, and clear separation of added explanation |
| Listening experience | Followability, unnecessary repetition, interruptions for visuals, useful detours, and perceived effort while walking |
| Retention and transfer | A later explanation or new problem after an agreed interval; record the actual interval and further study rather than attributing all change to the episode |

Biology scenarios remain provisional until intended learners contribute. Assess Dutch and English where materials and participants allow. Do not infer one language's performance from the other.

Define scoring and acceptance criteria before comparing outputs. A critical factual or source-support failure must be corrected; a pleasant conversation does not compensate for it. Retain raw observations and negative cases, not only favourable examples. Automated model reviews may assist inspection but cannot stand in for learner performance or participant feedback.

## Review passes and readiness

Perform distinct passes with recorded findings:

1. **Need fidelity:** Does the proposal solve the reported problem, especially the gap between knowing an economic concept and calculating with it? Are new assumptions labelled?
2. **Evidence challenge:** What is the strongest case against the chosen process? Are confidence and generalisation justified? Could a shorter or different approach produce the same benefit?
3. **Experience and outcome:** Can a learner complete preparation, correct a misunderstanding, listen, and attempt the intended learning task? What fails under changed or incomplete input?

Before recommending implementation, produce the evidence review, question-to-decision map, evaluated conversation alternatives, findings from available trials, unresolved requirements, and a decision memo explaining the choice. Keep participant-dependent conclusions open when real evidence is missing. A bounded experiment can be recommended with those limits; do not present it as a validated final experience.

After the research supports a direction and prompt drafting is in scope, develop shared teaching guidance and subject prompts with the owner. Evaluate candidate prompts on the same needs before integrating them. Treat implementation and subsequent learning validation as separate milestones.

## Work after the questioning research

The investigation above covers the questioning process. It does not also count as completed research into every subject, final prompt validation, or application implementation. The proposed follow-on sequence is:

1. **Agree the teaching principles.** Discuss the research recommendation and its tradeoffs with the owner. Establish what a useful episode should accomplish, how it handles evidence and uncertainty, and how it preserves depth and natural conversation. Resolve consequential disagreements before treating the direction as settled.
2. **Develop subject guidance together.** Start with politics for exploration, history with optional course requirements, and economics with numerical problem solving. Determine which instructions are shared and which need separate treatment. Leave biology's scope open for its intended learners.
3. **Compare candidate prompts.** Use representative material and the same evaluation criteria to inspect whether the prompts actually produce the intended explanations. Trace each consequential instruction to a learner need and a reason for including it. Revise rules that conflict or create repetition. Keep illustrative examples distinct from real course evidence.
4. **Pilot the complete learning experience.** Evaluate preparation, an episode, any optional visual or practice material, and a later learning task together. Check enjoyment as well as performance. Record improvements, regressions, and questions the pilot cannot answer.
5. **Implement the supported direction.** Carry the accepted learning behavior into a separately scoped implementation task. Verify that the application preserves the agreed behavior. Continue evaluation with actual use rather than treating a successful build as completion of the learning work.

Each stage needs its own recorded scope and completion evidence. Additional work is expected where it can resolve a meaningful uncertainty; neither the first plausible prompt nor the first successful episode establishes the final design.

## Continuation record

- Completed initial preparation: recorded user needs, inspected the local Matt Pocock grilling instructions, created this plan, and established a durable project working agreement. Added the owner's German-literature and Roman-Empire examples and corrected the interview framing to five core questions with targeted follow-ups.
- Completed scoping update: removed the mistakenly fixed duration, inspected official research-planning/usability guidance and the IES recommendations page, and added provisional estimates with explicit limits. The owner endorsed the five starting areas.
- Completed focused research pass (2026-09-14): needs map; primary evidence on clarification, task-level knowledge, examples, explanation/retrieval, segmented speech, podcast walking, and perceived versus demonstrated learning; N.A.G./grilling adaptation review; four conversation alternatives; original five-area candidate; fourteen constructed failure cases; separate needs, evidence, and scenario review. A research agent inspected ten learning-study publications and challenged the candidate. The review corrected a narrowed German reading scope, a weak economics follow-on task, and repeated knowledge/assistance questioning. See [the findings](learning-experience-findings.md) for the rationale and exact limits.
- Not completed: real course-pack evaluation, participant interviews/rehearsals, model runs of the candidate, comparative episodes, listening trials, delayed learning checks, final subject prompts, and implementation of this candidate. Desk inspection is not learner validation.
- Next research action: rehearse the candidate on an actual economics exercise with available answer guidance, check whether it identifies the relevant difficulty, and inspect the annotated-reading commitment against real text. Gather participant observations before treating the wording or readiness rule as established. No need to repeat independent research already recorded unless a finding or new requirement justifies it.
- Missing material: actual syllabus/assessment examples and other learners' perspectives. These constrain the next empirical claims, not the completed independent review. Do not contact anyone on the owner's behalf without authorization.
- For each research session, append date, question investigated, sources inspected, findings/counterevidence, artifacts, and the next unresolved step. Record active duration when measured; label unmeasured effort honestly. Preparing or updating this plan does not establish substantive research completion.

## Starting references

- [N.A.G. repository](https://github.com/lrdmora/N_A_G-Narrative-Anchor-and-Guide): previously reviewed as a prompt-system example; not a learning-effectiveness study.
- Matt Pocock local skill snapshot `3cca18b368ae95cdbdebbff572ccafa662551015`: `grill-me` resolves to `grilling`, which explores dependent decisions in rounds. Its exhaustive decision-tree approach is an inspiration to evaluate, not an automatic requirement for learners.
- [Official AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md): used for placing the project working agreement; not part of the learning-research evidence base.
