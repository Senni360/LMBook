# PWS vault: RTX 3060 feasibility and API costs

Assessed 2026-09-16. The owner requires LMBook to work on the existing RTX 3060, including `D:\Downloads\PWS\vault`, and wants costed API alternatives where local execution is impractical. Jev is explicitly excluded while API access is unavailable.

## Actual project and machine

Read-only inventory excluded `.obsidian`, hidden directories and symlink/junction traversal. No vault material was sent to an external model. Package/model downloads used public repositories, with no source text in those requests.

| Observation | Measured value |
| --- | --- |
| GPU | NVIDIA RTX 3060, 12,288 MiB VRAM; 4,225 MiB occupied at initial inspection |
| System | Intel Core i7-10700F, 8 cores / 16 logical processors; 34,277,621,760 bytes reported physical memory, approximately 32 GiB |
| Markdown | 291 files; 1,691,563 bytes; 1,647,634 Unicode characters |
| Whitespace-delimited words | 229,039; descriptive count rather than linguistic segmentation |
| Existing wiki links | 2,084 syntactic occurrences; not unique relationships |
| Other visible vault files | 2 Canvas files and 1 Base file; no PDFs, images or recordings found in this inventory |
| Largest Markdown note | 583,104 characters; 151,596 OpenAI embedding tokens |
| Total OpenAI embedding tokens | 473,674 using local `tiktoken` with `cl100k_base`, before overlap/prefixes |

This is a substantial human research project but a modest text-search corpus. The unusually long note is the important input-size case. File count alone is not a GPU-memory estimate. External links, documents outside the vault, attachments added later and plugin-managed hidden data are outside this measurement.

## Local execution evaluation

A standalone evaluation uses `intfloat/multilingual-e5-small`, revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, in an isolated environment under the root checkout's `.work/vault-model-feasibility-20260916`. It shares the installed CPU-only PyTorch without changing that installation, and adds Transformers 4.57.6 plus tokenizer/download dependencies in the isolated environment. It uses safetensors, disables implicit Hugging Face credentials/telemetry, and does not execute model-repository custom Python.

The benchmark intentionally uses CPU inference with four threads and batches of eight, reserving the GPU for other applications. All Markdown is split into at most 384 model-token passages with 48-token overlap; the model's passage/query prefixes and normalized average pooling follow its [official model card](https://huggingface.co/intfloat/multilingual-e5-small). This is a performance evaluation, not a new application test suite or shipped feature. Semantic result quality and citation-preserving production chunking require separate evaluation.

The run completed successfully. All 291 original Markdown hashes matched after execution. Only aggregate measurements go into this report; original text and embeddings were not uploaded.

| Measurement | Result |
| --- | --- |
| Parameters | 117,653,760 |
| First model download plus load | 31.16 seconds; not a cached startup measurement |
| Tokenization | 2.01 seconds |
| Corpus processed | 460,611 E5 tokens, 1,485 overlapping chunks |
| Largest note | 152,157 E5 tokens processed as 453 chunks, rather than truncated |
| Initial indexing, after warmup | **133.49 seconds** on four CPU threads |
| Raw normalized vectors | 2,280,960 bytes, about 2.18 MiB; excludes source text, metadata and a database wrapper |
| Sampled peak process working memory | **902,197,248 bytes**, about 860 MiB / 0.90 decimal GB; not total system RAM |
| Model/tokenizer cache | 492,794,646 bytes, about 493 MB; excludes Python environment dependencies |
| 24 warm query encodings plus vector search | **18.34 ms median, 26.49 ms p95, 30.54 ms maximum** |
| GPU inference memory | None: all model inference and search ran on CPU |
| Integrity | All result vectors finite; all 291 original Markdown files unchanged |

Queries were eight short authored Dutch/English/German requests repeated three times. These numbers do not include Electron IPC, UI rendering, cold startup, Luna generation or simultaneous background indexing, and do not establish relevant-hit accuracy. They are a single local run, not a load-distribution guarantee. Reproducible script and aggregate JSON are in the root checkout at `.work/vault-model-feasibility-20260916/benchmark.py` and `result.json`; the temporary environment/cache remain there for follow-up. No new repository tests were added.

## Recommended division of work

1. **Local search and storage:** keep exact filename/wiki-link/lexical search, source snapshots, change detection and the vector index on the computer. E5 is the measured CPU candidate; compare EmbeddingGemma only if it improves the relevant language/search results. Do not require GPU availability for opening and searching notes.
2. **Luna for interpretation and edits:** use bounded retrieved passages for explained links, summaries, contradictions, learning goals and conversation-to-note additions. Full-control permissions affect approval, not source fidelity or memory limits. Do not add a separate local general assistant solely to avoid very small API charges; offline capability would be a distinct reason.
3. **Optional hosted embeddings:** `text-embedding-3-small` is the simplest priced fallback if local setup, cold starts or indexing contention become unacceptable. `voyage-4-lite` is an equally priced comparison with a different provider. The resulting vectors can still be stored locally; buying hosted file-search storage is unnecessary for this architecture.
4. **Optional hosted reranking:** `rerank-3-lite` is a priced candidate if a second look at the retrieved passages improves results. Use only a short candidate list, not every source in the vault. This is a search stage, not a substitute for Luna's final explanation.
5. **Optional hard-page OCR:** prefer local text extraction and Tesseract first. Use `mistral-ocr-4-1` for difficult scanned pages if local extraction fails or a large vision pipeline causes poor responsiveness. There are no such pages in the current measured vault. Audio/visual specialists are not prerequisites for its Markdown workflows.

Keep one embedding model per index. E5 vectors cannot be compared with OpenAI query vectors: switching providers requires re-embedding the relevant index, or maintaining explicitly separate indexes. A CPU fallback using the same local model avoids this issue. Network failure should retain local lexical search and saved material; it cannot promise new cloud-generated output while offline.

## Costs with explicit assumptions

Prices checked on 2026-09-16, USD, standard processing, before tax, without free credits, cache discounts or negotiated rates. These are arithmetic estimates, not observed provider bills. An API key/account balance is separate from the owner's Codex subscription.

| Job / model | Price basis | Example cost |
| --- | --- | --- |
| Index this vault with `text-embedding-3-small` | $0.02 per million input tokens | 473,674 measured tokens plus an assumed 20% allowance for overlap/context = approximately **$0.0114** for an initial index. |
| Same with `text-embedding-3-large` | $0.13 per million input tokens | Approximately **$0.0739** under the same assumptions. Use only if language/retrieval evaluation justifies it. |
| `voyage-4-lite` embedding alternative | $0.02 per million provider-counted tokens | Also about **one cent** if token volume is similar. Voyage's tokenizer is different; its exact bill was not measured. |
| 1,000 bounded Luna jobs | $0.20/M input and $1.20/M output | Assuming 8,000 input tokens and 1,000 **total billable output tokens**, including any reasoning, per job: **$2.80**. Ten thousand equivalent jobs: $28. |
| 1,000 `rerank-3-lite` requests | $0.02/M processed tokens; query tokens counted once per candidate | With 20 passages of 500 tokens and a 50-token query: **$0.22**. This assumes Voyage token counts; not a measured query workload. |
| 100 difficult pages with Mistral OCR 4.1 | $4/1,000 OCR pages | **$0.40**, or $4 for 1,000 pages. Structured annotated Document AI is separately $5/1,000 pages. |

Primary rates: [OpenAI small/large embedding comparison](https://developers.openai.com/api/docs/models/text-embedding-3-small), [Luna model pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [OpenAI processing-tier prices](https://developers.openai.com/api/docs/pricing), [Voyage pricing](https://docs.voyageai.com/docs/pricing), and [Mistral OCR 4.1](https://docs.mistral.ai/models/ocr-4-1). [The API comparison](vault-api-cost-evidence.md) records provider billing units and unresolved alternatives, including why a Cohere price was not invented from third-party figures.

The embedding allowance is a sizing scenario, not the exact number billed by a production chunker. Each OpenAI embedding input must remain within the model's [8,192-token limit](https://developers.openai.com/api/docs/guides/embeddings); the largest note requires splitting even through the API. Only changed/new chunks and search queries need later embedding calls, so this is not the cost of opening the vault every time. API embeddings are inexpensive enough that avoiding them solely to save money is not a strong argument; local operation's advantages are offline availability and keeping indexing text on-device.

The Luna estimate assumes requests below its 272K-token long-context threshold, no tool fees, no paid cache writes and no retries. Long-context requests have higher rates; repeated agent steps, verbose reasoning and retries increase billable tokens. An 8K-input/1K-output example does not predict the actual monthly number or cost of all ten features. Podcast generation and transcription services are separate costs. Existing Codex-account limits are not translated into these API-dollar estimates.

Avoid comparing every pair of notes with an LLM: 291 notes already have 42,195 unordered pairs. Retrieve a bounded set of plausible connections first, remember rejected/unchanged pairs and process meaningful edits rather than every file-save event. The job scheduler and selected work explain costs more than whether the vault sounds large.

## Required application work and remaining limits

The current worktree's text index has a 128 MiB content budget and individual note reads allow 1 MiB; this vault is below those limits. However, `server/vault-learning.ts` caps imports at 150 sources, including the notebook's accumulated source count, and the summary route caps a request at 50 notes / 80,000 characters. The 291-note vault cannot simply be put into one notebook through the existing import flow, and its longest note exceeds the one-summary bound. These are application constraints, not evidence that the GPU is insufficient.

Support the owner's project through paginated import/scope selection and persistent chunk-based references with bounded hierarchical generation. Do not silently skip excess notes, truncate the long note, split the project into arbitrary notebooks, or remove all limits without a replacement resource plan. Source-complete operations need explicit coverage tracking across batches. A retrieval result is not evidence that all required material was considered.

Operational acceptance must include initial and incremental indexing, the real oversized note, interrupted jobs/resume, responsive editing while background work runs, low/no free GPU memory, mode changes during queued writes and network failures. Limit CPU workers and GPU concurrency, retry memory failures with smaller batches or CPU where supported, and expose an actionable paused state when resources remain insufficient. No design can promise full-speed operation when other applications consume all RAM/CPU/GPU, but it should preserve work and avoid crashing or silently omitting sources.

Only the local retrieval component is being measured here. No native packaged Electron acceptance, GPU inference throughput, all-feature agent evaluation, Dutch semantic-quality benchmark, larger-vault extrapolation or educational-effectiveness claim is established by this report. The recommendation is a feasible architecture to implement, not a claim that the requested features are already present in LMBook.
