# Jev live integration evaluation

2026-09-17 · LMBook 0.3.16 workstream. The owner's saved key authenticates successfully. All three Jev feature switches were already enabled in the owner's profile. Tests used synthetic sources in isolated libraries, with the real key held in process memory; the owner's notes, library and credentials were not changed.

## Outcome and changes

Jev works through the actual TypeSafe endpoint and LMBook's provider, notebook-review and desktop paths. Responses identified the model as `jev-1.13.0`. A working typed API is not evidence of infallible semantic judgments.

The first evaluation found a correct answer that the front of its flashcard already revealed. The old single Choice combined factual support, ambiguity and answer leakage, although those properties can overlap. The implementation now asks two independent questions per card: **source support** and **recall design**. A card can correctly be both supported and unsuitable for recall. Saved translations and source-verification status are never modified by these checks.

Answerability instructions now distinguish an evidenced negative answer from an unmeasured outcome. One observed response selected `not-answerable` while assigning `answerable` a slightly higher probability (0.40 versus 0.39). The provider's raw decision is retained. Locally derived consistency metadata marks a mismatch for review; tied maximum probabilities remain valid. Inconsistent connection judgments cannot authorize an automatic link, and inconsistent search judgments preserve the original result order. The mismatch was not reproduced in the six later controlled repeats; its cause remains unconfirmed.

Notebook results below 0.60 confidence or with inconsistent choices now prominently say **Needs review**, with the raw suggestion and full probability distribution available. The 0.60 display threshold and existing 0.80 link gate are heuristics, not calibrated accuracy guarantees. A UI review also identified a race where an old refresh could overwrite a completed review or feedback. Read revisions and mutation tracking prevent that overwrite.

## Recorded evaluation

Expected labels were authored before initial calls. Revised checks were rerun against the original fixtures; their expanded expectations reflect the new two-dimensional rubric. Separate held-out cases were authored before their own calls. These small, synthetic sets are diagnostic evidence, not a representative benchmark or learner study.

| Evaluation | Recorded outcome |
| --- | --- |
| Initial notebook rubric | 54/56 labels matched authored expectations; missed an answer leak and a qualified negative answer |
| Revised notebook rubric | 75/76 matched; one German vocabulary prompt was unexpectedly ambiguous at 0.40 confidence, therefore unresolved |
| Original vocabulary evidence subset | 12/12 preserved the distinction between supplied translations and substitutions, including false friends and gender-sensitive meanings |
| Held-out flashcard evidence | 12/12 matched |
| Held-out recall design | 10/12 matched; two generic prompts were incorrectly clear, both marked unresolved |
| Held-out answerability | Explicit negatives 3/3; unknown outcomes 1/3. All unknown-outcome decisions were low confidence and unresolved |
| Proposed note links | 9/12 matched authored labels; the three differences were unsupported versus expected uncertain. Only one of four supported examples cleared the existing automatic-action gate |
| Search reranking | Four candidate sets retained every match; relevant results generally rose, with one German ordering disagreement |
| Largest supported notebook review | 12 sources × 6,000 characters, 12 cards, all check kinds, 50 decisions in two requests of 32 and 18 questions; both HTTP 200 |
| Controlled repeat / order check | Six calls, three with reversed question/criterion ordering. Revised negative-answer judgment and leak detection remained consistent; the older answerability prompt varied at low confidence |

Detailed findings: [held-out cases](jev-notebook-recall-evaluation.md), [links/search](jev-link-search-evaluation.md), and [research and counterevidence](jev-live-research-2026-09-17.md). The checked-in [synthetic evidence record](evidence/jev-live-2026-09-17.json) preserves fixtures, returned judgments, probabilities, usage and repeated-call results. It contains no credentials or owner notes.

## Performance and cost

The first connection check completed in about 0.7 seconds. The 16 link/search calls took 198–639 ms at the provider boundary; the six held-out notebook calls took 200–552 ms. The largest review's two provider calls took 908 and 902 ms and reported 32,768 input tokens in total. These are observations on this connection, not latency guarantees.

The six recorded evaluation groups made 68 API requests and reported 105,921 input tokens: baseline 21,785; revised 25,742; links/search 10,896; held-out 9,930; full-size 32,768; repeat/order 4,800. At TypeSafe's published $0.042 per million input tokens, that is approximately **$0.00445** for these recorded calls. Additional connection and desktop calls are excluded from that subtotal, and actual account billing was not inspected. TypeSafe states that output tokens are free and pricing may be subsidized; this is not a durable price promise. [Official pricing](https://typesafe.ai/), [launch explanation](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

No GPU inference was required for Jev. The existing local embedding model remains a separate search component; this evaluation does not remeasure its RTX 3060 feasibility.

## Actual application behavior

The packaged Windows 0.3.16 executable completed a real connection check, enabled notebook review in its isolated settings, obtained live source/card judgments, showed separate support and recall results, saved feedback and restored it after reload. Light and dark screenshots were inspected; a narrower desktop window had no document-wide horizontal overflow. No renderer exceptions occurred.

Route diagnostics confirmed report persistence, feedback, stale-source detection and rejection after disabling the feature. A separate delayed synthetic transport confirmed that cancellation clears the active run and saves no report; this is not proof that TypeSafe stops or refunds a request already received. Synthetic inconsistent/tied-probability diagnostics confirmed raw-choice preservation, link gating and search-order fallback. The owner deferred new formal tests, so these are ignored manual/evaluation harnesses rather than additions to the automated test suite.

## Remaining limits and recommendation

Keep Jev for bounded review, conservative link checks and reversible reranking. The live calls establish that these integrations function; they do not justify treating Jev as a source-verification authority, automatically deleting/grouping notes, or certifying a complete idioom.

Unknown outcomes, vague prompts and relationship strength still need judgment. Low confidence caught the held-out misses in this fixture, but that does not prove all future errors will be low-confidence. No representative multilingual calibration or educational-outcome benchmark was found in the reviewed official material. The largest synthetic request fit; the character limits do not guarantee that every script or JSON shape fits the documented token budget. Transient service failures retain visible errors/fallbacks; automatic retry and account billing limits remain separate work.

The next meaningful evaluation is owner-adjudicated real course examples, including sufficiently difficult high-confidence errors and cases outside the sampled excerpts. It should evaluate false reassurance, abstention, useful links and search ordering separately. Adding another general model or making more calls on the same easy examples would not establish those outcomes.

Validation: all 38 existing application tests, the production/desktop builds and the packaged Windows startup/sandbox/persistence/restart smoke passed. No new formal test files were added. The current iteration is locally packaged; publication of 0.3.9–0.3.16 was separately authorized by the owner during this evaluation.
