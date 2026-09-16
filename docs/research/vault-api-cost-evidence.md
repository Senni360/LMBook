# Bounded hosted API fallback costs for a large Obsidian vault

Research date: 2026-09-16 (Europe/Amsterdam)

Scope: first-party pricing and model-limit evidence for an LMBook ingestion/search fallback on a Windows PC with an RTX 3060 12 GB. The actual vault at `D:\Downloads\PWS\vault` was not opened, measured, or sent anywhere. No API calls, paid providers, installs, or benchmarks were run. Amounts below are list prices in USD from the linked provider pages.

## Decision-relevant recommendation

For a first hosted fallback, Voyage is the most transparent fit: `voyage-4-lite` is explicitly multilingual, has a 32k-token context, costs $0.02 per million embedding tokens after a 200M-token account credit, and can be paired with a Voyage reranker. This makes a one-time or occasional large-vault index inexpensive unless the corpus is unusually large. Use a reranker only after vector/lexical retrieval has reduced the candidate set.

Use hosted OCR selectively for image-only or poor scans. Mistral's current `mistral-ocr-latest` points to OCR 4.1; standard OCR is $4 per 1,000 pages and Document AI/annotated output is $5 per 1,000 pages. Sending every text-native document through OCR adds handling and privacy cost without a retrieval need. The selective-OCR recommendation is an engineering inference from the billing unit and LMBook's ingestion flow, not a measured quality claim.

Cohere is a credible multilingual alternative, but its current primary pricing pages leave the self-serve API's numeric Embed/Rerank rates unavailable in the rendered public table. Do not hard-code third-party rate cards. Cohere is suitable for an evaluation key or a separately confirmed production quote; its dedicated Model Vault is enterprise-scale and not a cost-effective personal-vault fallback.

## Voyage AI: embedding plus reranking

**Embedding model and rate.** Voyage's current pricing page lists:

| Model | Billing unit | Standard rate | Free allowance |
|---|---|---:|---:|
| `voyage-4-lite` | input tokens to the embedding endpoint | $0.02 / 1M tokens ($0.00002 / 1K) | first 200M tokens per account |
| `voyage-4` | input tokens | $0.06 / 1M | first 200M tokens |
| `voyage-4-large` | input tokens | $0.12 / 1M | first 200M tokens |

The pricing page says the free token credit is account-level for those models; it is not a recurring monthly allowance. It also says Batch API has a 33% discount, a 12-hour completion window, and does not consume the free-token balance. Files API storage is $0.05/GB/month, with files retained for 30 days before automatic deletion. No minimum monthly fee is stated. Source: [Voyage pricing](https://docs.voyageai.com/docs/pricing).

Voyage describes `voyage-4-lite` as optimized for latency and cost, and the model table labels the 4-series models as general-purpose and multilingual. Each has a 32,000-token context and default 1,024-dimensional output, with 256/512/1024/2048 dimensions supported for `voyage-4-lite`. An embedding call accepts at most 1,000 inputs; the aggregate input-token ceiling is 1M for `voyage-4-lite`. The API can truncate over-length input by default, or error when `truncation=false`; for retrieval, the provider recommends explicitly setting `input_type` to `document` or `query`. Source: [Voyage embeddings](https://docs.voyageai.com/docs/embeddings).

**Reranking rate and unit.** Voyage bills reranking by processed tokens, not simply by HTTP request. The documented formula is:

`(query tokens × number of documents) + sum of tokens in all documents`

The current pricing table lists `rerank-3-lite` at $0.02/M processed tokens with an estimated $0.001 per request, and `rerank-3` at $0.05/M with an estimated $0.0025/request. The estimate assumes 100 documents and 500 tokens for the query-plus-each-document pair. The same table lists `rerank-2.5-lite` at $0.02/M and `rerank-2.5` at $0.05/M, with the same estimated request prices. Source: [Voyage pricing](https://docs.voyageai.com/docs/pricing).

The pricing page contains an inconsistency that should be verified in the billing dashboard before production: its prose says the first 200M tokens are free for `rerank-2.5`, `rerank-2.5-lite`, `rerank-2`, and `rerank-2-lite`, while the table shows `0` free tokens for the `rerank-2.5` and `rerank-2.5-lite` rows and does not show the 2.x rows. The `rerank-3`/`rerank-3-lite` rows do show 200M free tokens. Treat the 200M rerank credit as confirmed for 3/3-lite and unconfirmed for 2.5/2.5-lite until the account UI or provider support resolves it.

The reranker page describes `rerank-3` and `rerank-3-lite` as 32k-token models; `rerank-2.5` and `rerank-2.5-lite` are 32k-token, generalist, multilingual models. The API accepts at most 1,000 documents; for the 2.5 models the query may be up to 8,000 tokens, each query+document pair up to 32,000, and total processed tokens per request up to 600K. Source: [Voyage rerankers](https://docs.voyageai.com/docs/reranker) and [Voyage reranker API reference](https://docs.voyageai.com/reference/reranker-api).

**Worked cost bounds (not vault measurements).** At the documented $0.02/M rerank rate, a 100-candidate call with 500 tokens per query-document pair is about $0.001 after any applicable free allowance; 1,000 such calls are about $1.00. At $0.02/M for embeddings, 1B indexed tokens with 200M free would be about `(1,000M - 200M) × $0.02/M = $16`; 100M tokens would remain within the free allowance. These are arithmetic from provider list prices, not a claim about the size or token count of the owner's vault.

**Reranker versus an LLM prompt pass.** A hosted reranker scores a bounded candidate list with a predictable token formula and returns relevance scores. An LLM prompt pass must send the candidate text plus instructions/context and usually generates output tokens; its cost therefore scales with prompt size and output and may cost more per query. The correct LMBook comparison is the rerank request's documented processed-token cost against the project's chosen Luna prompt-pass input/output rate; no Luna rate is repeated here because it is handled in the parent cost analysis. Reranking is a retrieval stage, so it should not be used as a replacement for the final teaching answer.

## Cohere: multilingual Embed/Rerank and billing gotchas

**Model capability and limits.** Cohere's current Embed page lists `embed-v4.0` as text, image, and mixed text/image (including PDFs), with 128k context and 256/512/1024/1536 dimensions. The older `embed-multilingual-v3.0` supports over 100 languages, including Chinese, Spanish, and French. Source: [Cohere Embed models](https://docs.cohere.com/docs/cohere-embed).

Cohere lists `rerank-v4.0-pro` and `rerank-v4.0-fast` as multilingual. The v4 rerank best-practices page gives a 32,768-token context, query maximum 16,384 tokens, and up to 10,000 documents subject to chunk limits; v3.5/v3.0 use 4,096-token context and 2,048-token query maximum. Source: [Cohere Rerank models](https://docs.cohere.com/docs/rerank) and [Cohere reranking best practices](https://docs.cohere.com/docs/reranking-best-practices).

**Billing units and free tier.** Cohere's official pricing explanation says Embedding is billed by the number of tokens embedded, while Rerank is billed by search quantity. Cohere defines one search unit as one query with up to 100 documents. Its pricing FAQ says a document over 500 tokens, including the query length, is automatically split into multiple chunks; each chunk is treated as an individual document and counts toward the search's document total. Therefore, a long-document rerank can consume multiple search units even when the caller made one HTTP request. Source: [How Cohere pricing works](https://docs.cohere.com/docs/how-does-cohere-pricing-work) and [Cohere pricing](https://cohere.com/pricing).

The current official public pricing page does **not** expose a numeric self-serve pay-as-you-go rate for `embed-v4.0` or `rerank-v4.0-*`; it only states that production keys are pay-as-you-go and trial keys are free but restricted. The official rate-limits page says trial keys are free/limited, production keys are paid, trial keys are limited to 1,000 API calls per month, and the endpoint limits are 2,000 Embed inputs/minute and 10 Rerank requests/minute for trial keys (2,000 and 1,000 respectively for production keys). Source: [Cohere rate limits](https://docs.cohere.com/v1/docs/rate-limits) and [Cohere pricing](https://cohere.com/pricing).

This is a material cost-selection caveat: do not cite a third-party `$ per 1K searches` or `$ per million Embed tokens` number as current Cohere API pricing without confirming it in the account's production billing page. Cohere's public page says production bills at month end or when the account reaches $250 outstanding; that is a billing threshold, not a stated minimum fee. No pay-as-you-go minimum fee is stated.

For comparison, Cohere's separately priced, dedicated Model Vault is not the normal hosted API. The current official table lists Embed 4 Small at $4/hour or $2,500/month; Embed 4 Medium at $5/hour or $3,250/month; Rerank 4 Fast Medium and Rerank 4 Pro Medium at $5/hour or $3,250/month. Rates are per instance and the service uses monthly/annual Fixed or Flex commitments. This is far outside the intended personal-vault fallback unless there is sustained enterprise throughput. Source: [Cohere Standard Vault pricing](https://docs.cohere.com/docs/model-vault/standard/pricing).

## Mistral OCR 4.1: use only for hard pages

Mistral's current model page identifies OCR 4.1 (`mistral-ocr-4-1`) as the latest OCR service. It lists `$4 / 1,000 Pages` for OCR and `$5 / 1,000 Annotated Pages` for Document AI/structured annotation. The current API pricing table also shows a cached-input line of `$0.40 / 1,000 Pages`; this is a separate cached-input price, not a free tier. Source: [Mistral OCR 4.1](https://docs.mistral.ai/models/ocr-4-1) and [Mistral API pricing](https://docs.mistral.ai/inference/pricing).

The `mistral-ocr-latest` API accepts PDFs and common image formats, returns structured page markdown, and supports blocks, tables, bounding boxes, and confidence scores. Mistral's OCR language page lists strong OCR coverage for English, Dutch, French, German, Spanish, Portuguese, Italian, Polish, Czech, Danish, Finnish, Greek, Hungarian, Norwegian, Romanian, Swedish, Serbian, Catalan, Ukrainian, Arabic, Hebrew, Persian, Bengali, Hindi, Kannada, Marathi, Nepali, Punjabi, Tamil, Telugu, Indonesian, Tagalog, Vietnamese, Chinese, Japanese, Korean, Russian, Armenian, Georgian, and Turkish; it says performance can also be good in additional languages. Sources: [Mistral OCR processor](https://docs.mistral.ai/studio/document-processing/basic_ocr) and [Mistral supported languages](https://docs.mistral.ai/resources/languages).

Mistral's current pricing page describes Batch as high-volume processing at half price, and the OCR 4 announcement explicitly states $4/1,000 API pages becoming $2/1,000 with Batch; the OCR 4.1 model page itself only prints the standard and annotated rates. Budget the standard OCR 4.1 price unless the account's Batch selector confirms the 50% rate for the current alias. Source: [Mistral API pricing](https://mistral.ai/pricing/api/) and [OCR 4 announcement](https://mistral.ai/news/ocr-4/).

Mistral's Free plan currently advertises `$10/mo in API credits`, while the API usage-limits documentation says Free mode includes monthly usage within the limits shown in the account's Limits page. The public pages do not state a standalone OCR-page allowance, so do not convert the credit into a guaranteed page quota. Pay-as-you-go extends usage beyond included monthly usage. Sources: [Mistral plans](https://mistral.ai/pricing/) and [Mistral usage and limits](https://docs.mistral.ai/admin/billing-usage/usage-limits).

The practical policy for LMBook is therefore: keep text-native Markdown/PDF extraction local, detect pages that are image-only, badly scanned, or structurally important, and send only that subset to OCR. At list price, 100 difficult pages cost about $0.40 of standard OCR or $0.50 of annotated Document AI; 1,000 pages cost $4 or $5. This arithmetic is a budget bound, not a claim that OCR is necessary or that it will improve retrieval on every document.

## Open questions to resolve before implementation

1. Measure the vault's actual text-token and scanned-page totals in a local dry run; this was intentionally not done in this research pass.
2. Confirm in the Voyage account whether the 200M free-token credit applies to the selected 2.5 reranker, because the public pricing prose and table disagree.
3. If Cohere remains attractive after local retrieval evaluation, obtain the current production-key Embed/Rerank rates from the Cohere dashboard or sales/account quote; the public primary page currently omits those numeric API rates.
4. Confirm the Mistral OCR 4.1 Batch rate in the account UI before relying on the $2/1,000-page estimate.

## Router availability follow-up — 2026-09-16

The owner asked whether the proposed APIs could share an OpenRouter or KieAI account. This follow-up inspected official documentation and OpenRouter's public, unauthenticated model catalogues; no inference or credential use occurred.

| Exact service | OpenRouter | KieAI |
| --- | --- | --- |
| GPT-5.6 Luna | Confirmed as `openai/gpt-5.6-luna` in the public `/api/v1/models` catalogue; standard prices match the earlier $0.20/M input and $1.20/M output comparison. | Confirmed in the [Luna endpoint documentation](https://docs.kie.ai/market/chat/gpt-5-6-luna). No inference/reliability check performed. |
| OpenAI text-embedding-3-small | Confirmed in the [embedding catalogue](https://openrouter.ai/api/v1/embeddings/models), $0.02/M input tokens. | Not found in the reviewed official documentation; absence is not proven. |
| Voyage voyage-4-lite | Confirmed as `voyageai/voyage-4-lite` in that embedding catalogue, $0.02/M input tokens. | Not found in the reviewed official documentation. |
| Voyage rerank-3-lite | Exact model not confirmed. Search indexed OpenRouter rerank documentation, but the corresponding fetched documentation was unavailable and a guessed catalogue route returned 404. Do not turn that route failure into proof that all reranking is unsupported. | Not found in the reviewed official documentation. |
| Mistral OCR 4.1 | [PDF parsing documentation](https://openrouter.ai/docs/guides/overview/multimodal/pdfs) confirms a `mistral-ocr` engine billed to the OpenRouter account. It does not establish the exact 4.1 model or parity with the standalone OCR endpoint's bounding boxes/confidence controls. | Not found in the reviewed official documentation. |

OpenRouter's [pricing page](https://openrouter.ai/pricing) lists a 5.5% pay-as-you-go platform fee. Provider free credits do not automatically transfer to router billing. The PDF parser sends extracted content onward to a chat model and limits forwarded extracted images; it is not assumed equivalent to a standalone source-extraction service. The retrieved current PDF pricing text omitted numeric values, so the older 2025 $2/1,000-page announcement is not used as a current price claim.

The initial recommendation to use OpenRouter for Luna and potentially add direct specialist accounts is superseded by the owner's [selected routing policy](background-assistant-proposal.md#provider-routing--owner-decision-2026-09-16). The availability findings above remain research evidence, not selected billing paths or implemented integrations. KieAI lists Luna, but its reviewed [catalogue and guide](https://docs.kie.ai/) do not establish coverage of the specialist endpoints needed here. Local E5 remains independent of routers. Router use is separately billed from the existing Codex subscription, and listing a model does not establish account access or successful LMBook execution.
