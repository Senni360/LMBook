# Early Jev applications and LMBook opportunities

Research date: 2026-09-17. Jev launched in early access on 2026-09-15, so the evidence base is intentionally small. The owner now authorizes broad Jev experiments because API access is available. Luna/Codex routing remains unchanged; the provider exception is a direct TypeSafe key for Jev, while other hosted specialists use OpenRouter. This note records what is actually demonstrated or published, then translates the decision-model shape into bounded LMBook experiments. It does not treat TypeSafe's “zero hallucinations,” speed, cost, or calibration claims as established educational evidence.

## What Jev is useful for

TypeSafe describes Jev as state in, typed probabilistic decisions out. Its public interface has three primitives: `Choice` picks from a fixed set and returns probabilities plus confidence; `Score` places state on an ordered rubric and returns probabilities plus confidence; `Noul` returns the probability that a yes/no statement is true. Questions sharing a state can be sent together and are evaluated independently. The documentation recommends decomposing a complex judgment into atomic questions and composing the answers in application code. ([Introduction](https://docs.typesafe.ai/introduction), [Primitives](https://docs.typesafe.ai/primitives), [Confidence](https://docs.typesafe.ai/confidence))

This boundary matters for LMBook. Jev can judge, route, rank, gate, and score a candidate that already exists. It cannot write an explanation, generate a translation, preserve a passage verbatim, or invent a missing flashcard. A normal language model remains necessary for extraction, teaching prose, scripts, and repairs; Jev is a possible cheap, fast decision layer around those outputs.

## Concrete early applications

### TypeSafe's workflow evaluation and side-by-side decision demo

The launch article publishes a side-by-side query in which the same dense state is evaluated by Jev and GPT-5.6 Terra; the only reported disagreement was the ambiguous “churn likelihood level.” TypeSafe also publishes four code-defined workflow evaluations, using the average predictions of GPT-6 Astra and Fable 5.1 as the reference rather than independent ground-truth labels. The company reports 193.6× faster and 444.6× cheaper on that setup, while noting that its own capability team authored the workflows and that the numbers may be near the high end. ([Launch evidence](https://typesafe.ai/blog/introducing-system-one-models-and-jev#evidence--technical-results))

Observed implementation pattern: many independent judgments in one call, followed by deterministic code that combines probabilities and branches. Unsupported claim: that this predicts correctness on LMBook material or learner outcomes. The reference-model methodology is useful as a prototype comparison, not as a substitute for source-grounded review.

### Doom state-control demo

TypeSafe shows an AI Doom bot making roughly ten decisions per second from structured game state. The state is text/data, not screen pixels, and TypeSafe explicitly says a non-AI bot could play better; the point is reactive instruction following under a tight loop. The post estimates about $7/hour at that query rate. ([Doom demo and caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev#doom))

The transferable idea is not “use Jev for audio.” It is a fast repeated control loop where the valid action set is known and a confidence threshold can pause or escalate. In LMBook that shape fits interactive review queues and search-result triage, where the app can keep the source and user in control.

### Wikiracing high-cardinality choice

TypeSafe's Wikiracing demo asks the model to select among hundreds or thousands of links available on the current Wikipedia page. The post says Jev supports up to 255 choices directly; larger sets use a two-stage independent scoring pass followed by an explicit choice. TypeSafe presents this as an example of the compounding benefit of staying within a valid choice set, while also noting slower cases and non-reasoning baselines. ([Wikiracing demo and caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev#wikiracing))

The useful LMBook pattern is candidate generation plus bounded reranking: first produce a finite set with ordinary retrieval/code, then let Jev score or select among those candidates. It must never be asked to discover an uncatalogued source, URL, or quote.

### Official LLM adapter and agent skill

TypeSafe publishes `system-one-adapter-python`, a drop-in `TypeSafeClient`-shaped adapter backed by OpenAI or Anthropic APIs. It uses native structured output when available, can normalize probabilities, retries malformed structures, and records attempts, usage, latency, and retry reasons. This is an implemented comparison harness rather than evidence that Jev itself is available locally. ([Adapter README](https://github.com/typesafe-ai/system-one-adapter-python))

TypeSafe also publishes an agent skill that tells coding agents to design atomic typed judgments and use speculative fan-out. The public example is routing support tickets with human review for uncertain decisions. ([Agent skills](https://github.com/typesafe-ai/skills), [Speculative fan-out and patterns](https://docs.typesafe.ai/patterns))

The practical lesson for LMBook is to keep a provider-neutral decision interface and a replayable audit record. The adapter is a possible offline/mock comparator, not a Jev substitute whose accuracy should be assumed equal.

### Good Start Labs public X report: learning-environment grading

Alex Duffy of Good Start Labs publicly wrote that Jev was useful for “verification” in AI learning environments: on their sample it agreed with Fable 5.1 nine times out of ten, cost about 200× less for grading, and took under 0.5 seconds per grading call. The post says the team was using the result to get more eyes on what agents were doing and what they were teaching, and links to a longer explanation of their game-environment work. ([Alex Duffy's public X profile/syndicated post](https://x.com/alxai_), [accessible syndicated copy](https://www.sotwe.com/alxai_?lang=en), [Good Start Labs context](https://goodstartlabs.com/about))

This is a user report on one sample, not an independent benchmark or educational-effectiveness study. The valuable application is the role: a cheap second judge or verifier around generated teaching/game trajectories, with disagreements routed to a stronger model or person. Direct X fetching returned HTTP 403 during this research; the wording above comes from the accessible syndicated copy and is labelled accordingly.

## LMBook experiments worth trying

These are bounded candidates, not adopted product requirements. Each keeps original source text, generated interpretation, and Jev's judgment separate.

1. **Flashcard source-fidelity gate.** For each generated pair, send the source excerpt, candidate term, candidate translation, and provenance to parallel `Noul` questions: “Does the source explicitly support this pair?”, “Does the supplied translation remain unchanged?”, and “Is the pair a vocabulary item rather than an explanation?” Use the result only to prioritize `likely supported`, `needs review`, or `unsupported` work. No model probability or confidence may mark a card `verified`; completed verification still requires source checks and human review. Jev cannot generate the translation or prove arbitrary-PDF extraction complete. This directly complements the existing flashcard plan's source-review requirement.

2. **Flashcard quality and difficulty signals.** Use separate `Score` questions for ambiguity, likely learner difficulty, and whether the pair tests a useful recall unit. Store the full distribution and model/version beside the editable card. Use scores to sort a review queue or suggest practice order, never to silently delete or rewrite cards. Validate against a small manually reviewed set because “calibrated” is a provider claim until measured on LMBook's languages and materials.

3. **Source-change impact analysis.** When a Markdown or Obsidian note changes, compute the changed passage and affected goals/cards/episode segments in code. Ask Jev `Choice` questions for impact (`none`, `wording-only`, `conceptual`, `requirements-critical`) and `Noul` questions such as “Does this change invalidate the current summary?” High-confidence low-risk edits can be marked for review; low confidence or requirements-critical output should reopen source-coverage review. Do not let Jev overwrite the original or decide that a changed source is semantically equivalent without evidence.

4. **Search and note ranking.** Retrieval code should produce candidates using exact terms, embeddings, or file metadata. Batch `Score` judgments for “answers this goal,” “contains required terminology,” “is primary rather than supporting material,” and “has a usable citation anchor.” Combine these with deterministic lexical and recency signals. This is the Wikiracing pattern adapted to a finite candidate set; it improves ranking while avoiding invented links and citations. Keep the score distribution to explain why a result ranked highly.

5. **Learning-brief and interview routing.** For a learner response, use `Choice` to classify the needed treatment (`annotated reading`, `concept explanation`, `worked calculation`, `revision`, `source comparison`) and `Noul` to detect consequential ambiguity such as missing intended outcome or unclear fidelity requirement. Route only the missing follow-up questions to the learner. The model should not write the brief or infer that “overview” means summary; the five-area preparation policy remains authoritative.

6. **Coverage and source-review triage.** For each requirement and source section, ask a batch of `Noul` judgments: “Is this requirement addressed?”, “Is the evidence in the selected source?”, and “Is the claim explicitly supported or only inferred?” Use confidence gates to sort evidence into automatic, human-review, and unresolved queues. This makes coverage inspectable without claiming that a probability is proof.

7. **Episode preflight and escalation.** Before script generation, use `Choice` for treatment and `Score` for source-readiness, numerical-practice readiness, and unresolved ambiguity. A high-confidence ordinary case may proceed; medium confidence can show a targeted clarification; low confidence blocks only the affected decision and preserves the usable draft. A slow language model still writes the episode. Jev supplies a repeatable preflight signal and a structured audit trail.

8. **Verification of generated teaching.** Borrow the Good Start Labs role: after a script or flashcard set is generated, ask a separate judge to check each claim against the cited source and each worked calculation against the stated relationship. Treat agreement with another model as a triage signal, not truth. Human review and direct source checks remain the completion criterion for a verified learning artifact.

## Guardrails and next evidence

* “Cannot hallucinate” means the answer is constrained to the supplied type/options; it does not mean the selected option, score, or probability is correct. TypeSafe itself says its hallucination chart is schema-based and “not empirical.” ([Launch caveat](https://typesafe.ai/blog/introducing-system-one-models-and-jev#hallucination-and-type-safety), [independent explanation](https://julin.ai/2026/09/16/jev-typed-decisions/))
* Confidence thresholds must depend on the consequence of error. TypeSafe's docs recommend automatic action only at high confidence, review or clarification in the middle, and no action at low confidence; they explicitly say thresholds must be tested on the domain's data. In LMBook, confidence can prioritize review or trigger a fallback, but it cannot establish source fidelity or mark an educational artifact verified. ([Confidence guidance](https://docs.typesafe.ai/confidence))
* Jev's public API is early access and hosted. Broad use is now allowed, but no live Jev key is available in this worktree; current Jev diagnostics are mocked. The official adapter is an LLM-backed comparator, not local Jev weights. Do not claim a real Jev request or offline Jev use here.
* The most valuable LMBook evidence would be a small, manually adjudicated benchmark covering Dutch/German/English vocabulary, source-change cases, requirement coverage, and search ranking. Record per-question accuracy, abstention/review rate, calibration bins, latency, and disagreement with the existing model. A “zero hallucination” count without semantic correctness is not enough.

## Current bounded implementation status

All of the following are opt-in and default off. They are bounded integration points, not proof that all ten background-assistant directions are implemented:

* Luna scheduler: three user-selectable modes, undo/recovery, and the Jev advisory gate are wired as bounded controls. The actual Luna modes passed diagnostics; Jev diagnostics were mocked because no live key is available here.
* Jev manual notebook role: an optional manual action can assess one source at a time, pair relationships (up to 12), one goal/question, and the first 12 deck cards. It produces advisory results and review candidates only; it cannot mark anything verified or silently rewrite source material.
* Search: an optional top-10 Jev rerank can run within a five-second budget, with a deterministic fallback if it times out or is unavailable.
* Batching limits: source checks inspect at most the first 6,000 characters across 12 sources; background processing covers at most 150 notes per batch. These limits bound cost, latency, and accidental vault-wide processing.

The future user-facing behavior is documented separately in [the background-assistant UI specification](../ui/background-assistant.md), which is under active drafting.
