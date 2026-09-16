# Held-out Jev flashcard recall and answerability evaluation

Date: 2026-09-17. This is a bounded live evaluation of the current `server/jev-notebook.ts` route after the review split into separate `evidence` and `recall` questions. It tests route behavior and a small synthetic fixture; it does not establish educational accuracy.

The runner used six real route calls, each containing two flashcards plus one answerability question, for 24 flashcard judgments and six negative-answer/unknown-outcome judgments. The real key was read only in process memory from `C:/Users/senni/AppData/Roaming/SenniBook/data/jev-credentials.json`; it was not printed or stored in results. A fresh `.work/jev-live/notebook-recall-eval/data` directory and synthetic notebook were used. No owner data or production files were touched. The held-out fixtures are defined before the calls in [notebook-recall-eval.mts](../../.work/jev-live/notebook-recall-eval.mts); raw results are in [results.json](../../.work/jev-live/notebook-recall-eval/results.json).

All six HTTP calls succeeded with model `jev-1.13.0`. Provider usage was 9,930 input tokens and 1,344 output tokens. Provider latency was 200–552 ms per batch, with a 276 ms mean. No provider, route, schema, or transport errors occurred.

The evidence dimension matched all 12 authored card hypotheses. Normal English, Dutch and German pairs were supported; the two deliberately overgeneralized experiment answers were unsupported. The answer-leak cards were still evidence-supported, as expected, because factual support and recall design are separate questions.

The recall dimension matched 10 of 12 authored hypotheses. Both explicit answer-leak prompts were labelled `answer leak`, and the subject names in questions remained `clear`, rather than being treated as leaks. Two very short generic prompts expected to be `ambiguous` were labelled `clear` with low confidence:

| Card | Expected | Jev label | Confidence | Probability detail |
| --- | --- | --- | ---: | --- |
| `What happened?` | ambiguous | clear | 0.39 | clear 0.59, ambiguous 0.41 |
| `Leg dit uit` | ambiguous | clear | 0.47 | clear 0.65, ambiguous 0.34 |

Both are below the route's 0.60 review threshold and therefore become `unresolved`; the low confidence exposes the ambiguity even though the selected label is `clear`. The third ambiguous fixture (`Explain the process`) received the expected `ambiguous` label at confidence 0.47. The fixture is too small to infer language-specific performance.

The six answerability cases separated explicit negative findings from unmeasured outcomes. Three explicit negative findings were correctly `answerable` (English 0.96, Dutch 0.82, German 0.87). The three unknown-outcome cases were weaker:

| Case | Expected | Jev label | Confidence | Probability detail |
| --- | --- | --- | ---: | --- |
| English: sleep measured, exam scores not measured | not-answerable | answerable | 0.17 | answerable 0.45, partially-answerable 0.27, not-answerable 0.28 |
| Dutch: satisfaction measured, productivity not measured | not-answerable | not answerable | 0.23 | not-answerable 0.48, answerable 0.26, partially-answerable 0.26 |
| German: two-day study, no long-term health data | not-answerable | partially answerable | 0.18 | partially-answerable 0.45, answerable 0.40, not-answerable 0.15 |

Only one of the three unknown-outcome cases received the expected label. All three had confidence below 0.60 and were consequently marked unresolved by the route. The first English case is a direct semantic miss despite its low confidence; it should remain a review item rather than an automatic answerability decision.

The route's separate dimensions are useful: evidence remained correct for all cards while recall surfaced leaks independently, and the answerability rubric handled explicit negative findings better than absence of measurement. The observed low-confidence behavior is valuable for triage, but the wrong selected labels in two generic recall prompts and two unknown-outcome cases mean Jev should not automatically resolve those decisions. This fixture does not justify a threshold change or a claim about learning outcomes.
