# Local AI integration evaluation

Evaluated 2026-09-16 in the isolated `.work/ai-runtime-evaluation-20260916` directory. No owner vault files were read or modified. The existing benchmark checkpoint cache and Python environment were reused through a junction; this avoided a second model download.

## Observed

- `local_embeddings.py status` reported the pinned revision ready and the runtime importable when user site packages were available.
- A persistent worker emitted `ready` and returned one finite 384-dimensional vector for a 1,000-word input. The request used overlapping token windows and returned successfully without truncating the latter half.
- An invalid JSONL request returned a bounded JSON error record instead of crashing the protocol.
- A model directory without `.download-complete` reported `ready: false`; starting the worker on it returned the controlled “not prepared for offline use” failure.
- The TypeScript lifecycle refused embedding while disabled. A full Node-hosted smoke run could not use the reused benchmark environment with `PYTHONNOUSERSITE=1`, because that benchmark environment obtains CPU PyTorch from the user site rather than its own site-packages. This is an evaluation-environment limitation; a fresh app setup installs dependencies into the separate app venv as designed.

## Follow-up

The semantic provider contract now carries `kind: "query" | "passage"`; indexing should pass `passage` and query search should pass `query`. The setup path performs its own offline load and query smoke after installing the pinned dependencies, so setup does not enable the feature after a failed smoke.

## Fresh installer run

The real app setup was run in `.work/ai-fresh-install-20260916` with a new venv and no junctions or shared runtime. Dependency installation completed, the pinned checkpoint downloaded, and the offline smoke load/query completed. The resulting status reported the detected Intel i7-10700F (16 logical cores, approximately 32 GiB RAM) and RTX 3060 (12 GiB) with a `good` CPU fit.

After explicit enablement, the Node-hosted API returned both query and passage embeddings (384 dimensions), unloaded the persistent worker, and successfully started it again for a second query. The first status probe exposed a five-second timeout because importing Torch took slightly longer on this fresh venv; increasing the bounded probe timeout to 15 seconds produced `ready: true` and `worker: true`. No vault content was used.

## Integrated vault follow-up

The earlier observations above used authored inputs. A later root-agent evaluation used the actual PWS vault read-only through the integrated TypeScript/Python/indexing path. All 291 Markdown notes produced 1,494 chunks in 209.52 seconds; one warm query returned ten results in 60.21 ms. Every original note hash was unchanged. Windows default stdin decoding initially failed on a real Unicode note; the persistent worker now explicitly uses UTF-8. Long inputs use overlapping token windows with a query/passage prefix per window, including whitespace-only windows. A successful setup now writes a separate verified marker only after the offline smoke completes. Runtime state changes are serialized, and cancellation/idle unload terminate the active worker cleanly. Full scope and evaluation limitations are in [the delivery record](ai-integration-delivery.md).
