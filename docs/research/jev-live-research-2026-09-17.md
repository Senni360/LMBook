# Jev live research: practical limits and reliability questions

Research date: 2026-09-17. This note is based on the current TypeSafe documentation, launch material, SDK/repository surfaces, public early reports, and inspection of LMBook's Jev adapter. I did not read or use the user's API key, make a Jev request, or change production code. The parent workflow owner is handling live authentication and evaluations. The conclusions below concern what should be measured before trusting Jev with LMBook judgments.

## The current contract

TypeSafe documents one hosted endpoint, `POST https://api.typesafe.ai/v1/systemone`, using a bearer key and model `jev-latest`. A request contains one `state` (string, object, or array) and a map of named typed questions. The public API has three primitives: `Choice` selects from caller-defined options; `Score` returns a probability-weighted value over ordered levels; `Noul` returns a yes/no probability. The response contains one typed answer per question and token usage. ([Official quick start](https://docs.typesafe.ai/introduction/quickstart), [API reference](https://docs.typesafe.ai/api), [State](https://docs.typesafe.ai/concepts/state))

The official docs say each question sees the same state and is evaluated independently. They recommend one focused judgment per question, composing larger decisions in application code. Questions that truly depend on an earlier result require a second request; otherwise they should be batched. The documented shared request budget is around 32,000 tokens, described as roughly 150,000 English characters, rather than a promise that every language or JSON shape reaches that exact capacity. ([Primitives and batching](https://docs.typesafe.ai/primitives))

The API reference defines schema validity, not semantic correctness. A Choice's returned label is the highest-probability caller-supplied option; its probabilities cover the supplied options. A Score may fall between rubric levels because it is probability-weighted. Noul is a number from 0 to 1 and has no separate confidence field. Choice/Score `confidence` is derived from the distribution's shape, and TypeSafe says the appropriate threshold depends on the risk and the application's own data. ([API answer types](https://docs.typesafe.ai/api#response-body), [Confidence guidance](https://docs.typesafe.ai/confidence))

The current official pricing language remains the launch pricing: $0.042 per million input tokens ($42 per billion), with output tokens described as free. TypeSafe says the cost may be subsidized and does not publish a durable quota or service-level commitment in the public API reference. Treat this as a current stated price, not a guaranteed long-term rate. ([TypeSafe pricing page](https://typesafe.ai/), [launch pricing and caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev#frontiers-old-and-new))

### Limits visible in LMBook's adapter

The implementation in [`server/jev.ts`](../../server/jev.ts) intentionally narrows the public API to Choice:

* `shared/jev.ts` accepts only `type: "choice"`; Noul and Score are not exposed to LMBook yet.
* Requests are limited locally to 32 questions, although this is an LMBook batching choice aligned with the documented shared budget rather than a confirmed TypeSafe hard question-count limit.
* Each Choice is limited locally to 255 options, matching TypeSafe's launch description for direct high-cardinality Choice. Larger candidate sets need an application-side score-then-select design.
* Serialized state is limited locally to 120,000 characters. Notebook review separately takes the first 6,000 characters of each selected source, at most 12 sources, the first 12 cards, and up to 12 relationship pairs; task calls are sent in batches of 32.
* Search reranking sends only the first 10 existing results, truncates each passage to 1,800 characters, applies a five-second timeout, and preserves the original order on failure. A confidence below 0.6 receives a reduced ranking weight; that is an LMBook heuristic, not a TypeSafe-calibrated threshold.
* General calls use a 120-second timeout. Connection checks send only a fixed authored string. Keys are stored host-side with atomic replacement and are never returned in responses.
* HTTP 401, 422, 429 and 529 are surfaced as user-facing errors. The adapter does not implement exponential backoff; the official SDK documentation says its SDKs retry 429/529 under their default policy. The current direct `fetch` path therefore needs live observation before assuming SDK-equivalent resilience.

These bounds are reasonable containment choices, but they are not proof that a result covers an entire source or notebook. The report schema labels results advisory and records `confidenceNote: "Model confidence is not measured accuracy."` That distinction should remain visible.

## Confidence: useful signal, unsafe certificate

TypeSafe defines confidence as a statistic derived from the Choice/Score probability distribution. A concentrated distribution is treated as more certain; a flat distribution as less certain. Its docs suggest three operational bands: act automatically at high confidence, review or clarify at medium confidence, and do not act at low confidence. They also state that thresholds must be set and tested for the domain and consequence. ([Confidence](https://docs.typesafe.ai/confidence))

The official Choice contract also states that `choice` is the highest-probability option. In a live source experiment reported by the owner, Jev returned `choice: "not-answerable"` while the reported probabilities were `not-answerable: 0.39`, `answerable: 0.40`, and `partially-answerable: 0.21`, with confidence `0.10`. The question concerned whether evidence of growth from 15° to 20° proves that every further increase improves growth; the experiment had tested 15°→20° and had no observations above 20°. This is a material discrepancy between the returned label and the displayed probabilities under the documented argmax interpretation.

It is not yet a confirmed TypeSafe defect. Plausible explanations include a copied or transformed response, rounding or serialization, a stale UI field, a mismatch between the exact response and the displayed values, or an undocumented tie/decision policy. The low confidence correctly signals that this should not drive an automatic action, but it does not explain the label mismatch. Preserve the raw HTTP response, request, model ID, timestamps, and token usage in the next reproduction; run the same question repeatedly and compare the API response with the UI/report serialization. Until resolved, LMBook should treat the returned label and probabilities as separate evidence and route any near-tie or argmax mismatch to review.

This incident reinforces TypeSafe's own recommended design: ask independent atomic questions and compose them in code, rather than asking one broad question to prove a universal claim. For the growth example, separate “Does the evidence support growth between 15° and 20°?”, “Does the evidence include any measurement above 20°?”, and “Does the evidence establish that every further increase improves growth?” Then apply an explicit evidence rule: absence of observations above 20° cannot support the universal claim. ([Atomic questions](https://docs.typesafe.ai/primitives), [State and evidence fields](https://docs.typesafe.ai/concepts/state))

The company calls the probabilities calibrated and describes RLCD as training for “epistemically honest” uncertainty. Its workflow evaluation, however, compares model probabilities to the average outputs of GPT-6 Astra and Fable 5.1 rather than an independent labeled ground truth. TypeSafe also says its own team authored the workflows and that the headline speed/cost numbers may be near the high end. ([Launch evidence and caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev#workflow-evals))

There are two separate failure modes:

1. A high-probability option can be semantically wrong because the state is incomplete, the rubric is ambiguous, or the model misreads the evidence.
2. Even a well-calibrated individual probability does not automatically give a calibrated result after several dependent judgments are combined in code. Error correlation and selection effects must be measured in the composed LMBook workflow.

Type safety removes malformed or off-schema outputs. It does not make a supplied classification true, a source relationship supported, a flashcard faithful, or a contradiction real. TypeSafe's own hallucination chart says its zero figure is schema-based and not empirical; independent technical commentary makes the same distinction between output validity and decision correctness. ([TypeSafe caveat](https://typesafe.ai/blog/introducing-system-one-models-and-jev#hallucination-and-type-safety), [analysis](https://julin.ai/2026/09/16/jev-typed-decisions/))

For LMBook, confidence may prioritize a human queue, choose a fallback, or request more evidence. It must never mark a source check, card, link, or learning claim `verified` by itself.

## Evidence by reliability question

### Multilingual behavior

The public API accepts text or structured state, but the official materials do not publish language coverage, language-specific calibration, or Dutch/German evaluation results. The examples are English support tickets, English prose, Wikipedia links, and English-oriented workflow descriptions. The launch post does not claim multilingual parity. ([Quick start](https://docs.typesafe.ai/introduction/quickstart), [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev))

Searches for public “Jev multilingual,” Dutch, German, and language-specific benchmarks found no primary TypeSafe evidence. That absence is not evidence of poor multilingual performance; it means LMBook must measure Dutch, German, and English separately. Mixed-language state, translated criteria, inflection, idiom, named entities, and code-switching should be distinct slices. Never transfer an English threshold to the owner's language pairs without labels.

### Negation and contradiction

TypeSafe's docs show that a question can compare named fields in a structured state and recommend explicit field paths. The LMBook connection checker follows that pattern: it gives Jev two quoted passages and asks whether they support a proposed relationship, with `supported`, `uncertain`, and `unsupported` options. This is a useful bounded question, but the answer space does not establish that all contradictions have been found. ([State and field paths](https://docs.typesafe.ai/concepts/state), [LMBook connection path](../../server/jev-assistance.ts))

No official Jev benchmark was found for negation, temporal qualifiers, exceptions, “not necessarily,” source revisions, or contradiction pairs. Generic retrieval/NLI research warns that negation can collapse under dense similarity, so topical relatedness is a poor contradiction test by itself. ([Negation taxonomy and retrieval benchmark](https://arxiv.org/abs/2507.22337), [contradiction-aware retrieval failure analysis](https://arxiv.org/abs/2603.17580))

LMBook should therefore test minimal pairs: “X causes Y” versus “X does not cause Y”; changed dates; scope words such as “only,” “unless,” and “at least”; and two passages that discuss the same term with different claims. Include a neutral pair and an incomplete-context pair. A high-confidence `unsupported` result can be a useful review signal, but it cannot replace exact quote comparison or a human adjudication of contradiction.

### Retrieval and ranking

TypeSafe documents candidate ranking as a natural Choice/Score use case and publishes Wikiracing as a high-cardinality Choice demonstration. It states that direct Choice supports up to 255 options and that larger sets can be handled by independent scoring followed by explicit selection. These are structural examples, not evidence that Jev improves retrieval recall or citation quality. ([Wikiracing caveat](https://typesafe.ai/blog/introducing-system-one-models-and-jev#wikiracing), [Choice/Score guidance](https://docs.typesafe.ai/primitives))

LMBook's search integration is appropriately narrow: lexical/semantic retrieval creates candidates; Jev sees only the top 10, each truncated to 1,800 characters, and reorders them within a five-second budget. It retains all original matches and falls back if unavailable. This avoids fabricated links, but it can only rerank candidates that retrieval already found. Evaluation must report recall-before-rerank, recall-after-rerank, reciprocal rank, and whether the top result has an inspectable citation anchor. A better rank position cannot compensate for a missing source.

### Classification, answerability, and source support

The official examples support short classifications such as department routing, urgency, frustration, and whether a refund is requested. The docs explicitly say “analyze this message and determine the best course of action” is too broad for one atomic judgment. ([Primitives](https://docs.typesafe.ai/primitives))

This aligns with LMBook's notebook checks: source role, source relationships, learning-goal support, question answerability, and flashcard quality are separate Choice questions. The implementation uses the same state for independent decisions and stores source IDs, probabilities, and advisory status. That is a sound audit shape, but it does not supply ground truth. For each check, build a small adjudicated set with supported, unsupported, uncertain, and out-of-scope cases. Measure abstention and false reassurance, not only top-label agreement.

The flashcard check is especially sensitive: it asks whether a candidate pair is clear and supported, ambiguous, answer-leaking, or unsupported. Jev cannot extract a missing card, preserve an authoritative translation, or prove completeness. Source-review failures must remain visible while practice remains possible.

## Pricing, usage, and operational risk

TypeSafe publishes $0.042 per million input tokens ($42 per billion) and says output tokens are free. It states that these prices may be subsidized and that its 193.6×/444.6× workflow figures are workload-specific. The launch post does not publish a durable account quota, rate-limit number, regional SLA, retention policy, or a complete error/retry contract. ([Official pricing claim](https://typesafe.ai/blog/introducing-system-one-models-and-jev#frontiers-old-and-new), [API errors](https://docs.typesafe.ai/api#errors))

The API reference documents 401 (invalid key), 422 (validation), 429 (rate limit), and 529 (temporary overload), and recommends exponential backoff for 429/529. The current LMBook adapter maps these to a generic retry-later message and does not automatically retry. Do not infer that a feature is unavailable, or that a result was never billed, from a transient failure without observing the response and account usage.

The practical cost risk is repeated state, not output tokens. Each independent request resends its state; notebook batching reduces request count but can still repeat long excerpts across batches. The current caps, five-second search timeout, 120-second general timeout, cache, and default-off feature flags are important containment. A live usage evaluation should capture input tokens, elapsed time, HTTP status, retries, cancellation, and whether repeated calls produce materially different choices.

## Early real-world examples and evidence quality

TypeSafe's own concrete demos are Doom (structured game state, about ten decisions per second, not pixels) and Wikiracing (large bounded link choices). The company explicitly says a non-AI Doom bot could play better and that Wikiracing speedups vary with baseline and cardinality. ([Launch demos](https://typesafe.ai/blog/introducing-system-one-models-and-jev#fun-demos))

Alex Duffy of Good Start Labs publicly reported on X that Jev agreed with Fable 5.1 nine times out of ten on their sample for grading game-learning environments, at under 0.5 seconds per call and roughly 200× lower grading cost. The accessible syndicated copy is the evidence available here; direct X fetching was previously blocked with HTTP 403. This is a single early-user report, not an independent benchmark or proof of educational effectiveness. ([X profile](https://x.com/alxai_), [syndicated post](https://www.sotwe.com/alxai_?lang=en), [Good Start Labs](https://goodstartlabs.com/about))

TypeSafe also publishes an LLM-backed Python adapter and official JavaScript/Python SDK surfaces. The adapter helps compare schema-compatible LLM calls, but it is not evidence about Jev itself and must not be used to claim live Jev behavior. ([Official GitHub organization](https://github.com/typesafe-ai/), [LLM adapter](https://github.com/typesafe-ai/system-one-adapter-python), [client SDK docs](https://docs.typesafe.ai/sdk))

## What live evaluation should establish before trust

The next evaluation should use a fixed, versioned LMBook set and human adjudication. It should include:

* English, Dutch, and German source passages, including code-switching and supplied translations.
* Exact contradiction/negation minimal pairs, temporal changes, scope qualifiers, and deliberately incomplete context.
* Source roles, goal support, answerability, and flashcard cases with unsupported, ambiguous, answer-leaking, and correct pairs.
* Search queries where the relevant passage is in rank 1, ranks 2–10, outside the top 10, and absent from retrieval entirely.
* Repeated identical calls and small prompt/state perturbations to check stability.
* Threshold curves: coverage, false-accept rate, false-reject rate, abstention, calibration error, and the percentage sent to manual review. Evaluate composed workflows separately from individual questions.

Record the exact model ID, request size, input-token usage, latency, HTTP failures, retries, and source revision. Keep the original excerpts and human labels beside each result. Treat a successful API connection as authentication evidence only; it does not establish multilingual accuracy, contradiction detection, source fidelity, or educational value.
