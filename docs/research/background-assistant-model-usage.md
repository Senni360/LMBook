# Background-assistant model usage

Updated 2026-09-16. Living implementation record, not a completed feature report. The owner permits all researched small models when useful and requests used/not-used explanations after the work. All ten background-assistant directions and the three control modes are accepted in [the specification](background-assistant-proposal.md).

## What has actually been used

| Model or component | Actual use so far | Why / evidence boundary |
| --- | --- | --- |
| GPT-5.6 Luna research contributors | Three parallel contributors researched retrieval, document/audio specialists and local assistants; one also reviewed the combined shortlist. | Split bounded research and cross-check language/runtime claims. This was research assistance, not a new LMBook model integration, model benchmark or proof of teaching quality. Their evidence notes accompany `docs/research/small-model-candidates.md` in the root checkout. |
| GPT-5.6 Luna API-cost contributor | One additional contributor checked Voyage, Cohere and Mistral primary pricing and billing units. | Supported the [3060 and cost assessment](vault-3060-feasibility.md); no vault text or paid provider inference was used in that research. |
| multilingual-e5-small | **Downloaded and executed locally** against all 291 Markdown notes in the owner's PWS vault, CPU-only, with four threads. | Demonstrated bounded retrieval/indexing resource feasibility even without free GPU memory: 133.49 seconds indexing, 18.34 ms median warm query, about 0.90 GB peak process RAM. Original note hashes unchanged. Exact revision and evaluation limits are in [the report](vault-3060-feasibility.md). Not integrated into LMBook; retrieval accuracy is not yet evaluated. |
| Existing Tesseract OCR | Existing application baseline was inspected; no new OCR inference in this decision/report update. | Reusing this engine may be the simplest route to German scans. Existing English/Dutch configuration is not evidence that the German model was added or run. |
| Existing faster-whisper transcription | Existing application baseline was inspected; no new transcription in this decision/report update. | Word timestamps and speech filtering are already enabled. Avoid claiming those capabilities as new model work. |

### Implementation update — 2026-09-16

The table above records the earlier research phase. **multilingual-e5-small is now integrated**, with explicit download/enable controls, a separate Python runtime, offline execution and per-vault meaning search. Revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`; CPU, four threads. The actual app pipeline indexed all 291 PWS notes into 1,494 passages in 209.52 seconds; one warm query took 60.21 ms. Original note hashes were unchanged. These measurements differ from the earlier standalone benchmark because the actual pipeline includes different token-window handling and persistence. Search quality has not been scored.

**Luna through Codex was actually executed** for the readiness reply and a short explanation of this machine's hardware report. No notebook content was supplied to either request. It also remains the existing generation option. Claude Code is not required: the owner explicitly corrected onboarding to Codex/OpenAI.

**OpenRouter is integrated** for selectable hosted chat and optional `openai/text-embedding-3-small` vault embeddings. The adapter and failure handling were exercised with authored responses, but no real OpenRouter account/key was supplied, and no paid OpenRouter inference was run. Live authentication and provider availability remain for connection in Settings. E5 was selected as the default local specialist because it completed the real workload without using VRAM; cloud embeddings are an explicit alternative for machines where local setup or indexing is inconvenient.

Existing faster-whisper setup and Tesseract remain available in the unified local-model settings. Neither was replaced or newly evaluated during this implementation. Optional models do not all load together; the E5 worker unloads after idle time. The ten background-agent workflows are not implemented by this integration. [Delivery and evaluation](ai-integration-delivery.md).

## Candidates not yet used and why

These are deferrals unless explicitly described as a poor fit; they are not permanent rejections. Update individual rows as execution occurs and record the actual checkpoint/revision/runtime, task, result and limitation.

| Candidate | Current reason for not using it |
| --- | --- |
| Voyage hosted embeddings / reranking | A second embedding backend is unnecessary before comparing actual retrieval quality. A reranker adds per-search latency and cost without a demonstrated selection problem. No direct API was introduced. |
| Larger OpenAI hosted embeddings | Small embeddings are the first OpenRouter fallback. A larger index and higher cost need evidence of better Dutch/German retrieval before becoming an app default. |
| Mistral OCR / Cohere hosted specialists | Neither is required for the delivered setup and text-search workflow. Document OCR routing and reranking need task-specific integration and verification; no direct provider API bypasses the OpenRouter preference. |
| EmbeddingGemma | High-priority comparison for semantic search; requires an anchored index and a representative Dutch/English/German retrieval comparison before choosing the runtime. |
| Qwen3-Embedding-0.6B | Heavier search alternative; no observed failure yet establishes that it is needed over a smaller embedder plus lexical search. |
| Qwen3-Reranker-0.6B | Potential second-stage improvement after retrieval exists. Its extra latency must earn better final evidence selection. |
| BGE-M3 | Richer search/index options add storage and integration work; comparison with the simpler baseline comes first. |
| LFM2.5-Embedding-350M / ColBERT-350M | Dutch is not in the reviewed named language lists; short document windows, separate terms and multi-vector indexing also need consideration. |
| German Tesseract `deu` | Concrete high-priority addition, but not yet integrated into the manifest, language controls and evaluation path. Correct row pairing still needs separate handling. |
| Granite-Docling-258M | Useful English layout comparison; documented English scope prevents assuming it solves Dutch/German source extraction. |
| PaddleOCR-VL-1.6 | Difficult-page candidate with a much heavier full pipeline. Native Mac packaging and exact Dutch/German behavior remain unresolved. |
| ColModernVBERT | Promising visual slide search, but it needs an image index and page-level evidence flow; Dutch/German behavior is unverified. |
| Tongue | Small local language suggestions could help; no demonstrated need yet to replace source metadata, user choice or existing language handling. |
| fastText language identification | Comparator for Tongue; runtime integration and mixed/short-language behavior need checks. Never use it as a translation verifier. |
| GLiNER multilingual v2.1 | Concept spans could support source maps, but omissions and false positives must not control required coverage. Validate on a bounded workflow first. |
| GLiNER2 multilingual PII filter | Optional sharing assistance; false positives can remove useful course names and missed entities prevent a privacy guarantee. Not required for the initial accepted workflows. |
| Qwen3 0.6B / 1.7B | Plausible offline metadata baseline. First establish that local generation provides value over headings/plain code or the existing Luna connection. |
| LFM2 / LFM2.5 text assistants | Efficient local candidates, but Dutch evidence is incomplete and an extra general assistant must save actual work. Prefer evaluating current checkpoints. |
| Gemma 3 1B IT | General local comparison; no evidence yet that adding it improves the chosen workflow over Qwen or Luna. |
| Qwen3.5-0.8B | Newer multimodal option; larger advertised capability does not establish better small Dutch extraction. Needs task-specific comparison. |
| SmolLM3 3B | More local resources for a general assistant; no current task requires this additional model. |
| FunctionGemma | Task-specific specialization/training is material work. Correctly formatted actions do not prove correct decisions. |
| TypeSafe Jev | **Excluded by the owner's explicit direction: no API access yet; do not implement.** Use code and Luna for bounded decision roles initially. Revisit only when access changes and a useful gap remains. |
| Moonshine | Possible live/CPU transcription benefit; no replacement decision before comparing Dutch terminology, numbers and timestamps with the existing worker. |
| Picovoice Leopard / Cheetah | Alternative transcription adds commercial/runtime considerations without a demonstrated current advantage. |
| WhisperX | Existing word timestamps cover basic seeking. Add forced alignment only when an observed timing problem justifies the extra dependencies. |
| MMS alignment | Broad language coverage, but checkpoint licensing and footprint make it a weaker default than bounded language-specific alignment comparisons. |
| Additional Silero VAD stage | The existing ASR already filters speech. No demonstrated need for duplicate processing that could clip quiet words. |
| DeepFilterNet3 / Clear | Optional noisy-recording comparisons; unnecessary processing can damage speech. Retain originals and evaluate only on an actual noise problem. |
| Picovoice Rhino | Specific voice commands are not required to deliver the current background-assistant changes. Possible later hands-free feature. |
| Picovoice Porcupine | Wake phrases have limited immediate value without an established hands-free interface. |
| Haku specialists | Interesting narrow tasks, but platform availability and current workflow fit remain uncertain. |
| Atome | Tiny-device focus does not address a demonstrated Electron learning-workflow gap. |
| Aneurologic | Access and independently inspectable evidence are insufficient for choosing it now. |

## How to keep the final report honest and useful

For each model actually tried, record the exact checkpoint and revision, runtime/device, download versus execution versus shipped status, the concrete task, observed benefit/failure and why it was retained or removed. A model tested and rejected belongs in the used/evaluated section as well as the final decision, not silently in never-used. Include actual usage/cost observations where available; do not estimate savings as though they were measured.

At delivery, explain the selected combination in plain language, then list unused alternatives and the specific reason each was unnecessary, unsuitable, superseded or still unverified. Distinguish this deliverable's status from historical model use elsewhere in LMBook. No model's agreement or confidence counts as proof of source correctness or learning effectiveness.
