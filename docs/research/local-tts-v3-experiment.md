# Chatterbox V3 on the RTX 3060

Date: 2026-09-14. This is an isolated feasibility experiment, not a production speech provider or a listening-quality endorsement. Cloud TTS and credential setup belong to the owner's other agent. No cloud credentials were read or changed here, and no new automated test files were written.

## Observed result

Chatterbox Multilingual V3 loaded and generated four short, authored passages on this Windows machine's RTX 3060 12 GB. All four outputs were finite, nonempty, mono 24 kHz WAVs. The existing local Whisper environment transcribed the samples without changing that environment or its models.

| Passage | Output seconds | Generation seconds | Generation time / audio time |
| --- | ---: | ---: | ---: |
| English, coalition qualification | 10.80 | 38.98 | 3.61 |
| English, percentages | 11.32 | 17.44 | 1.54 |
| Dutch, coalition qualification | 11.40 | 20.51 | 1.80 |
| Dutch, enzymes and pH | 12.88 | 23.43 | 1.82 |

Model loading took 18.22 seconds after imports. The first generation was slower than subsequent calls; the experiment did not isolate the reasons for that difference. These short-run ratios are not a measured one-hour rendering time. No full episode, cancellation/retry exercise, sustained voice-identity trial, or human listening evaluation was performed in this initial run.

The largest CUDA allocation recorded by PyTorch was 3,545,331,200 bytes (3.30 GiB), with 3,925,868,544 bytes (3.66 GiB) reserved. These figures exclude driver and non-PyTorch allocations. Windows reported a process peak working set of 5,182,930,944 bytes (4.83 GiB), reached during model loading. Other applications remained running. The Python process exited after generation, releasing its model allocation.

## Fidelity checks and limits

The English and Dutch coalition passages round-tripped through faster-whisper large-v3-turbo with the wording intact. The numerical passage preserved 80, 92, 12, and 15 percent, but recognition returned “with” where the input said “what.” The biology passage returned “PF” where the input said “pH.” These are candidates for listening review: ASR can make its own errors, so this does not establish what the synthesizer pronounced. Transcript agreement also does not establish pleasantness, naturalness, or comfort over an hour.

The built-in `conds.pt` supplied one default voice without a custom reference. Changing random seeds is not evidence of a stable second voice. Two distinguishable, repeatable hosts remain unresolved for this model.

Two raw waveforms slightly exceeded full scale: peaks 1.0207 and 1.0553. The initial PCM16 files contain four and three samples at the representable limit respectively. Keep these initial artifacts as observations; do not treat naive PCM conversion as a finished export policy. Subsequent boundary samples preserve a float WAV and apply only a peak reduction to 0.98 when creating PCM16, retaining the original text and upstream watermark.

## Reproduction and setup findings

- Code: [official Chatterbox checkout](https://github.com/resemble-ai/chatterbox/tree/5de7a54aa4e5e2baadb0182dde554908b48b85c2), revision `5de7a54aa4e5e2baadb0182dde554908b48b85c2`.
- Model: [official model snapshot](https://huggingface.co/ResembleAI/chatterbox/tree/5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18), revision `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`.
- Python 3.11.15; `torch==2.6.0+cu124`, `torchaudio==2.6.0+cu124`; Chatterbox's declared dependencies installed into `.work/local-tts-v3/venv`.
- The declared Perth dependency follows `master`; the actual installed revision was `ff1c8ac55a976971245cdd53c18d6131ca00d993`. Preserve that resolved revision instead of assuming the upstream dependency declaration is reproducible.
- Explicit call: `ChatterboxMultilingualTTS.from_local(model_directory, "cuda", t3_model="v3")`. The pinned loader defaults to V2 when the model argument is omitted and its downloader uses `main`. Neither default was used for the selected speech checkpoint.
- Selected files: `ve.pt`, `t3_mtl23ls_v3.safetensors`, `s3gen.pt`, `grapheme_mtl_merged_expanded_v1.json`, `conds.pt`, and `Cangjie5_TC.json`. Files were checked against sizes and published LFS hashes where available; all hashes were recorded. A truncated T3 download failed verification, then resumed with a checked HTTP range and passed the full-file hash. It was never loaded before verification.
- Generation used upstream default delivery settings, seed 8123, four CPU threads, the built-in condition, and the upstream Perth watermark. No watermark removal or voice cloning was performed.

The upstream Chinese tokenizer constructor downloaded `spacy_ontonotes.zip` even with English/Dutch-only input and `HF_HUB_OFFLINE=1`. That flag controls Hugging Face, not every dependency. The additional archive is 34,567,143 bytes, SHA-256 `b216e7f92de7ae285aeab8feba2faa8ea8216e5995ff6fb3d391cc8356db1bfe`, from the [spacy-pkuseg release](https://github.com/explosion/spacy-pkuseg/releases/tag/v0.0.26). Its first-run default cache was `%USERPROFILE%/.pkuseg`. A verified copy was then prepared inside the experiment, with `PKUSEG_HOME` set there for the boundary run. The existing ASR environment was not modified. A production implementation must explicitly control all caches and preparation downloads; calling `from_local` alone is insufficient.

The pinned generator hardcodes `max_new_tokens=1000`. LMBook's existing cloud chunk size must not be passed unchanged to this model. Short sentence groups are a candidate starting point, with exact source text retained and explicit checks for incomplete output.

## Longer input: failed fidelity check

Two additional authored passages contained 168 English words (1,139 UTF-8 bytes) and 172 Dutch words (1,235 bytes). Both fit within the application's existing 2,800-byte cloud speech chunk budget. Each contained distinct sentences and a closing qualification about the limits of using majority size to explain government durability.

| Input | Output seconds | Generation seconds | Sampling counter at exit |
| --- | ---: | ---: | ---: |
| English, 168 words | 30.32 | 80.95 | 759 / 1,000 |
| Dutch, 172 words | 39.96 | 60.19 | 1,000 / 1,000 |

Both produced valid waveforms, but the local ASR check showed major omissions, substitutions, and incoherent fragments. The Dutch call reached the hard output limit. The English call stopped earlier and still failed the transcript comparison, so checking for the limit alone would miss this failure. No conclusion about precisely which sounds the model spoke is made without listening; these results are nevertheless insufficient evidence of faithful delivery and must fail a production readiness decision.

The longer experiment retained raw float WAVs and used peak reduction for PCM16 exports. Prepared local caches were used with Hugging Face offline mode and Python socket connection attempts rejected after imports. The run completed without attempting those connections. This checks ordinary Python network paths, not an operating-system network isolation boundary.

A follow-up kept each original passage exactly intact while grouping complete sentences into at most 45 whitespace-separated words. Each language yielded five chunks; joining their input strings with the original spaces exactly reproduced the initial input. All ten chunks generated successfully. Each joined WAV includes 0.25 seconds of silence between groups and a single peak-reduction gain for PCM16 conversion.

| Input delivered in five chunks | Output seconds, including pauses | Generation seconds, excluding model load | Generation time / audio time |
| --- | ---: | ---: | ---: |
| Same English passage | 55.88 | 79.17 | 1.42 |
| Same Dutch passage | 57.04 | 82.61 | 1.45 |

The joined recordings' ASR recovered the passage sequence and closing qualifications in both languages. This was a substantial improvement over the long calls. It was not a clean fidelity pass: English recognition substituted “Seed” for “Seat” and appended an unrelated fragment; Dutch recognition had several word substitutions and repeated part of the closing sentence. These could include ASR errors as well as synthesis errors. Listening and comparison of flagged individual chunks are still required before attributing them to the synthesizer. Do not claim that chunking alone guarantees faithful delivery.

There is specific counterevidence to interpreting the appended text literally: the recognizer assigned the three-word English fragment only 0.12 seconds, with word probabilities approximately 0.0013, 0.000005 and 0.024. It assigned the longer Dutch repeated fragment only 0.06 seconds. Those implausible alignments make recognition artifacts a strong alternative explanation. They should be shown as uncertain findings, not used to automatically edit the spoken source or label the synthesizer as having said those words.

The recovery run's largest PyTorch allocation was 3,600,778,752 bytes (3.35 GiB), with 4,194,304,000 bytes (3.91 GiB) reserved. Logical sizes for the model files/cache, isolated Python environment, tokenizer cache and checkout total about 8.75 GB; shared uv caches and system dependencies are additional. These constructed passages do not establish a generally safe chunk maximum for every language, formula, or source style.

## Local artifacts

All generated audio and environment files are local, ignored artifacts under `.work/local-tts-v3/`; they are not bundled into LMBook or uploaded to a provider.

- `manifest.json`: code/model revisions, selected file sizes and hashes, additional tokenizer artifact.
- `requirements-resolved.txt`: actual environment package versions and resolved Git dependency.
- `passages.json`, `measurements.json`, `generation.log`: authored short passages, observed performance and diagnostics.
- `asr-roundtrip.json`: full local transcripts and timestamped word evidence.
- `samples/en-conversation.wav`, `samples/en-numbers.wav`, `samples/nl-conversation.wav`, `samples/nl-terms.wav`: initial speech samples.
- `boundary-passages.json`, `boundary-measurements.json`, `boundary-generation.log`: completed longer input experiment and its outputs.
- `boundary-asr-roundtrip.json`: full recognition of the longer outputs, including the failed fidelity cases.
- `recovery-passages.json`, `recovery-generation.log`, and `recovery/`: the exact-text, short-sentence follow-up, per-chunk float audio, joined PCM WAVs, metrics and full ASR comparison.

## Decision

The Windows/GPU setup is feasible for short bilingual calls. Do not promote it to the production voice selector yet. Resolve the long-input failure boundary, technical-term pronunciation, repeatable two-host conditions, offline preparation, peak handling, and sustained listening before adding a production adapter. See the [candidate comparison](local-podcast-tts.md) for the maintained Piper fallback and other alternatives.
