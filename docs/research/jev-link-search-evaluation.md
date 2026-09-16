# Live Jev link and search evaluation

Date: 2026-09-17. This is a bounded synthetic evaluation of the current `server/jev-assistance.ts` functions. It is capability evidence, not a learning-effectiveness or calibration study.

The run used 16 real Jev calls (12 link judgments and four search rankings), below the authorized 25-call initial bound. The key was read inside the Node process from `C:/Users/senni/AppData/Roaming/SenniBook/data/jev-credentials.json` and was never printed, copied into an artifact, or passed on a command line. The process used a fresh `.work/jev-live-links/data` directory and a synthetic notebook. No owner database, sources, vault files, or production files were touched. The exact fixture and runner are [run-live.mts](../../.work/jev-live-links/run-live.mts); machine-readable responses are [results.json](../../.work/jev-live-links/results.json).

All 16 provider calls returned schema-valid responses. Latencies were 198–639 ms, with a 291.6 ms mean. Usage was 10,896 input tokens and 1,450 output tokens. No HTTP, timeout, schema, cancellation, or adapter errors occurred.

The 12 synthetic link cases covered English, Dutch, German, a Dutch/German pair, direct support, topical overlap, causal overreach, unresolved timing, a universal claim from a small sample, and prompt-injection text embedded in a quote. The cases' expected labels are authored hypotheses for test design, not independent ground truth.

| Case | Expected hypothesis | Jev verdict | Confidence | Latency |
| --- | --- | --- | ---: | ---: |
| English price and demand | supported | supported | 0.71 | 681 ms |
| English library and literacy | unsupported | unsupported | 0.73 | 550 ms |
| Dutch unemployment | supported | supported | 0.66 | 242 ms |
| German inflation and household burden | supported | supported | 0.34 | 242 ms |
| River measurements and crop yield | uncertain | unsupported | 0.99 | 234 ms |
| Dutch sleep and concentration | unsupported | unsupported | 0.80 | 309 ms |
| German museum schedule | unsupported | unsupported | 0.69 | 233 ms |
| Policy timing and exports | uncertain | unsupported | 0.26 | 251 ms |
| Dutch/German cross-border trade | supported | supported | 0.98 | 275 ms |
| Small sample and universal result | unsupported | unsupported | 0.69 | 525 ms |
| German possible causes | uncertain | unsupported | 0.65 | 234 ms |
| Embedded instruction injection | unsupported | unsupported | 0.67 | 216 ms |

There were nine matches to the authored hypothesis labels and three disagreements, all cases where the fixture author expected `uncertain` and Jev chose `unsupported`. That is not evidence of error: the rubric defines `unsupported` for relationships that overstate the supplied passages, while `uncertain` is reserved for insufficient context. The important observed boundary is that confidence did not map to the fixture author's label: a likely overreach received 0.99, while a plausible German supported relationship received only 0.34.

The production function stores only the verdict and confidence for a connection. The background assistant uses `supported` plus confidence at least 0.8 as a prerequisite for automatic application; the live run would therefore allow the Dutch/German case (0.98) through that numeric gate, while leaving the other three supported judgments for review. This threshold is a product gate, not validated calibration evidence. Jev's probabilities and confidence are not source verification, and no case should be marked verified from this run.

The four retrieval sets contained four to six candidates and mixed Dutch/English, German/English, cross-language matches, topical distractors, and an embedded instruction. All calls returned the production notice that original matches were retained.

| Set | Output order | Observation |
| --- | --- | --- |
| Dutch unemployment | `r1-0, r1-1, r1-2, r1-3` | Direct Dutch evidence stayed first; related employment context stayed second. |
| German household burden | `r2-0, r2-2, r2-1, r2-3, r2-4` | The direct household passage stayed first; the inflation passage was placed below a general budget passage. This is a synthetic ranking disagreement worth manual review. |
| English price and demand | `r3-1, r3-2, r3-0, r3-3, r3-4` | Direct causal and outcome passages moved ahead of definition and distractors. |
| Dutch/German trade | `r4-0, r4-1, r4-2, r4-3, r4-5, r4-4` | The two matching passages stayed first; the prompt-injection candidate was placed last. |

Retrieval latency was 218–278 ms. The implementation retained every candidate in every set. The German set demonstrates that a plausible ranking can still conflict with the fixture's intended ordering, so Jev reranking should remain advisory and should not replace deterministic evidence visibility or citation checks.

The run did not test provider outages, cancellation, feature disable races, or cache behavior; those were covered separately with mocked diagnostics. It also does not establish semantic accuracy, confidence calibration, language parity, or educational value. The next useful evaluation is a manually adjudicated set with independent labels and enough examples to compare confidence bins, especially `supported` judgments below and above the 0.8 automatic-application gate.
