# Local two-voice podcast TTS review

**Reviewed:** 2026-09-14  
**Scope:** local generation for SenniBook on Windows with an RTX 3060 12 GB, English and Dutch episodes, two stable speaker identities, 1–2 hour final programs, retryable chunks, and low recurring cost. The initial comparison was research-only. A subsequent [isolated Chatterbox V3 experiment](local-tts-v3-experiment.md) generated short English/Dutch samples and measured resource use; it did not change the existing CUDA ASR environment. Listening quality and two-host suitability remain unresolved.

## Recommendation

**Chatterbox Multilingual V3** is the first candidate under evaluation. The [local experiment](local-tts-v3-experiment.md) established short-call Windows/GPU feasibility but found serious fidelity failures on longer inputs; it is not ready for a production adapter. It is the only current candidate in this review whose official model card lists both English and Dutch in one checkpoint. Its normal example calls `generate(text)`; a reference audio prompt is shown only as an optional way to change the voice, so voice cloning is not required for the baseline. The repo and model card are MIT licensed, the package declares Python >=3.10 and has a CUDA device path, and the V3 language checkpoint is listed as 500M parameters. These are promising fit signals, not proof that the RTX 3060 has enough headroom or that the voice sounds acceptable for hours.

Keep **Piper** as the low-resource bilingual fallback/control, but use the maintained **OHF-Voice/piper1-gpl** successor rather than the archived Rhasspy checkout. The successor publishes `piper-tts` with a CPython 3.9+ Windows x86-64 `abi3` wheel (34.1 MB) and documents Python, CUDA, and streaming APIs. That materially reduces the Windows setup risk found in the first review. The tradeoff is licensing: the maintained engine is GPL-3.0-or-later, while each voice remains a separate artifact whose model card gives its own dataset license. A medium voice is roughly 63–77 MB in the official voice repository. Treat Piper as a practical bilingual fallback whose naturalness and exact voice licensing still need listening and legal review.

Use **Kokoro-82M** only as an English quality/speed control. Its official language codes cover American/British English, Spanish, French, Hindi, Italian, Japanese, Brazilian Portuguese, and Mandarin; Dutch is absent. Its 82M Apache-licensed weights, built-in voice packs, and generator that yields split outputs make it attractive for inexpensive English chunking, but it cannot serve SenniBook's bilingual requirement by itself.

Do not select **Qwen3-TTS** for the bilingual path. The official 0.6B and 1.7B model cards list ten languages and omit Dutch. It does offer nine preset timbres, a documented streaming-oriented tokenizer, Apache-2.0 weights, and a 0.6B custom-voice checkpoint whose main file is 1.81 GB plus a 682 MB speech tokenizer. That is useful evidence for a future English-only comparison, but not enough reason to add a second engine now.

### Piper successor correction

The earlier fallback wording treated Piper as archived and Linux-oriented. That is incomplete for the current package: the archived `rhasspy/piper` repository points development to **OHF-Voice/piper1-gpl**, whose official README still installs with `pip install piper-tts`. PyPI currently lists `piper-tts` as GPL-3.0-or-later, requires Python >=3.9, and publishes a CPython 3.9+ Windows x86-64 `abi3` wheel. The successor's Python API documents both `use_cuda=True` (with `onnxruntime-gpu`) and generator-style streaming. This changes Piper from “Windows setup uncertain” to “practical fallback worth a separate isolated trial.”

Two exact preset pairings are ready to compare from the official voice repository:

- **Pair A:** `en_US-lessac-medium` + `nl_NL-pim-medium`. Both are one-speaker, medium-quality, 22,050 Hz voices; the Lessac card points to the Blizzard 2013 license and Pim's card lists CC0.
- **Pair B:** `en_GB-alan-medium` + `nl_NL-ronnie-medium`. Both are one-speaker, medium-quality, 22,050 Hz voices; Alan's card points to the Mycroft voice license and Ronnie's card lists CC0.

These are source-verified availability and licensing facts, not a claim that either pair sounds natural or remains comfortable for an hour. The maintained engine is GPL-3.0-or-later even though the voice cards have their own dataset terms, so any future distribution review must cover both layers.

## Candidate comparison

| Candidate | English / Dutch coverage | License, weights, and resource signal | Windows/CUDA and voices | Long-form behavior and operational risk | Decision |
|---|---|---|---|---|---|
| **Chatterbox Multilingual V3** | Official list: 23 languages, including `en` and `nl`. | MIT code/model card. V3 is described as 500M; the official HF repo contains the selected V3 T3 file at about 2.14 GB and the pinned loader's `s3gen.pt` file at about 1.06 GB, alongside older checkpoints. These file sizes are download/storage signals, not measured VRAM use. | Official package is `pip install chatterbox-tts`; repo declares Python >=3.10 and selects CUDA when available. The example generates without `audio_prompt_path`; the prompt is optional. No stable built-in voice catalogue or speaker-identity guarantee is documented, so two repeatable default voices remain an experiment question. | The documented API returns a waveform for a text call. I found no official long-form limit or streaming API guarantee for V3. SenniBook should supply sentence/paragraph chunks, cache each WAV, and retry independently. V3's claims of “more natural,” fewer hallucinations, and stronger stability are upstream claims, not independent MOS or 1–2h evidence. | **First experiment.** Best bilingual fit, pending voice identity, VRAM, Windows dependency, and listening checks. |
| **Piper (maintained OHF-Voice successor)** | Current voice docs include `nl_NL`, `nl_BE`, `en_US`, and `en_GB`. Two exact pairings are available for a first trial: `en_US-lessac-medium` + `nl_NL-pim-medium`, or `en_GB-alan-medium` + `nl_NL-ronnie-medium`. | The maintained engine is GPL-3.0-or-later. Voice files remain separate artifacts; the official cards show about 63.2–63.5 MB for the medium voices in those pairings. The Lessac card points to the Blizzard 2013 dataset license, Alan points to the Mycroft voice license, and Pim/Ronnie list CC0. Review those upstream terms before redistribution. | PyPI lists `piper-tts` with Python >=3.9 and a 34.1 MB CPython 3.9+ Windows x86-64 `abi3` wheel; the wheel provenance points to OHF-Voice/piper1-gpl v1.8.0. The Python API supports `use_cuda=True` through `onnxruntime-gpu` and exposes `PiperVoice.synthesize` for streaming. Voices are fixed presets; no cloning is needed. | Small fixed voices remain suited to per-sentence/per-paragraph generation. The maintained API improves Windows install and streaming practicality, but the official sources still do not promise a maximum text length, long-form speaker continuity, or 1–2h failure behavior. Quality labels (`low`, `medium`, `high`) are model metadata, not a naturalness score. | **Stronger fallback/control than the archived assessment.** Try it if Chatterbox setup or voice identity fails; do not let the improved wheel availability hide the GPL and voice-license review. |
| **Kokoro-82M** | Official codes cover `a` American English, `b` British English, `e` Spanish, `f` French, `h` Hindi, `i` Italian, `j` Japanese, `p` Brazilian Portuguese, and `z` Mandarin. Dutch is not listed. | Apache-2.0 weights; 82M parameters. The official repo calls it lightweight/faster/cost-efficient; no local peak-VRAM number is supplied. | Official Python package is `kokoro`; Windows instructions cover installing espeak-ng. Built-in voice packs such as `af_heart` are available; no cloning is needed. | The official generator accepts a split pattern and yields one output per split, which is useful for caching. This is chunked generation, not proof of low-latency streaming or long-form prosody. Claims of quality comparable to larger models are upstream claims; no Dutch path exists. | **English-only control.** Useful if Chatterbox English sounds poor or too costly, but cannot be the bilingual engine. |
| **Qwen3-TTS 0.6B / 1.7B** | Official list: Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian. Dutch is absent. | Apache-2.0. The 0.6B CustomVoice repo is about 2.5 GB total (1.81 GB main file plus 682 MB tokenizer); the 1.7B CustomVoice main file is about 3.83 GB. These are download sizes, not a 12 GB VRAM guarantee. | Official setup recommends a fresh Python 3.12 environment, `pip install -U qwen-tts`, and recommends FlashAttention 2 to reduce GPU memory. The model card provides nine preset timbres, including English-native Ryan and Aiden, plus other language speakers. | The tokenizer/model card claims streaming generation with end-to-end latency as low as 97 ms. That does not establish reliable 1–2h generation, cross-chunk speaker consistency, or Windows FlashAttention compatibility. | **Reject for current bilingual path.** Keep as a future English-only benchmark if a second environment is justified. |

## What SenniBook already protects

The current implementation already has several useful operational patterns:

- `server/core.ts` limits each speech chunk to 2,800 UTF-8 bytes, keeps whole words, and preserves speaker labels.
- `server/jobs.ts` checks the abort signal between segments, writes completed segments to a chapter cache, and combines only validated WAV data.
- `server/audio-cache.ts` fingerprints script text, language, both voice settings, and the selected TTS model; it writes segments atomically, rejects malformed WAVs, quarantines stale caches, and reuses completed work after cancellation.
- The current provider is Google speech in `server/providers.ts`; local TTS would need to preserve the same Buffer/WAV contract and cancellation/cache semantics. This review does not propose that production change.

The practical gap for a local model is upstream model behavior rather than cache mechanics: no reviewed model documents a 1–2 hour single-call contract. Keep generation chunked and treat model output as untrusted until WAV format, duration, and segment order are checked.

## Bounded next experiment

Continue in the **isolated TTS environment** documented in the [experiment report](local-tts-v3-experiment.md); do not install into the ASR environment. Chatterbox has passed the short-call setup check but failed longer-input fidelity checks. Resolve or reject that failure before extending the chunk/listening run. The maintained OHF-Voice Piper package remains a separate fallback/control.

1. Prepare two short test passages in each language: one conversational paragraph and one source-dense paragraph containing names, numbers, punctuation, Dutch diacritics, and English technical terms. Use no reference audio and no cloning.
2. Generate two candidate speaker settings per model. For Chatterbox, record whether the no-prompt call is repeatable enough to serve as Speaker A/B; do not assume that an unprompted result has a stable identity across calls. For Piper, trial these two exact English/Dutch pairings: `en_US-lessac-medium` + `nl_NL-pim-medium`, then `en_GB-alan-medium` + `nl_NL-ronnie-medium`. Record each voice card and its dataset license before any redistribution.
3. Start with short sentence groups, provisionally around 30–60 words. The pinned Chatterbox generator hardcodes 1,000 output speech tokens; the earlier 80–220-word proposal is too broad without boundary measurements. Preserve the exact input wording when splitting. Run 20–30 chunks per candidate, cache by model revision, language, voice, text hash, and settings, and retry one failed chunk without regenerating prior chunks.
4. Record measured peak VRAM/RAM, real-time factor, output duration, failure/retry count, malformed/empty audio count, and disk use. A 12 GB RTX 3060 fit is **unresolved until measured**.
5. Listen for Dutch pronunciation, English technical terms, abrupt boundaries, repeated prosody, speaker identity drift, unnatural emphasis, and “annoying AI voice” fatigue. Check whether two speakers remain distinguishable for 10–15 minutes before attempting a full hour.
6. Pass a candidate only if it completes the chunk run with no data loss, produces valid concatenable WAVs, remains intelligible in both languages, and is acceptable for sustained listening. Only then consider a production adapter.

## Evidence limits and unresolved questions

- All quality statements above come from official repositories/model cards. “Natural,” “state of the art,” “comparable quality,” low latency, and reduced hallucination are claims or demo-oriented descriptions; no independent listening panel or SenniBook long-form trial was run here.
- Chatterbox's short-call Windows setup and GPU fit are now measured in the [experiment report](local-tts-v3-experiment.md). Stable two-host identity, Dutch pronunciation, technical-term fidelity and sustained performance remain unverified.
- Piper's Windows wheel and Python floor are now verified, but the chosen voice cards' redistribution terms, CUDA runtime behavior, and whether the fixed voices are pleasant for learning podcasts remain unverified.
- Kokoro's English quality and chunk throughput may be useful, but Dutch coverage is an official hard miss.
- Qwen's streaming claim is relevant to interactive audio, but Dutch omission and FlashAttention/setup burden make it out of scope for the first bilingual trial.
- The local engine should not be chosen by parameter count alone. Human listening plus measured retries, cache recovery, and resource use are the decision evidence.

## Primary sources

- [Chatterbox official repository](https://github.com/resemble-ai/chatterbox)
- [Chatterbox package metadata](https://github.com/resemble-ai/chatterbox/blob/master/pyproject.toml)
- [Chatterbox MIT license](https://github.com/resemble-ai/chatterbox/blob/master/LICENSE)
- [Chatterbox HF model card and files](https://huggingface.co/ResembleAI/chatterbox)
- [Qwen3-TTS official repository](https://github.com/QwenLM/Qwen3-TTS)
- [Qwen3-TTS 0.6B CustomVoice model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice)
- [Qwen3-TTS 0.6B CustomVoice files](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/tree/main)
- [Kokoro official repository](https://github.com/hexgrad/kokoro)
- [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M)
- [Piper upstream repository](https://github.com/rhasspy/piper)
- [Maintained Piper successor](https://github.com/OHF-Voice/piper1-gpl)
- [Piper successor license](https://github.com/OHF-Voice/piper1-gpl/blob/main/COPYING)
- [Piper successor voice documentation](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md)
- [Piper successor Python API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md)
- [Current piper-tts package and Windows wheel](https://pypi.org/project/piper-tts/)
- [Piper voice catalogue](https://github.com/rhasspy/piper/blob/master/VOICES.md)
- [Piper official voice repository](https://huggingface.co/rhasspy/piper-voices)
- [Piper English Lessac model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD)
- [Piper English Alan model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_GB/alan/medium/MODEL_CARD)
- [Piper Dutch Pim model card](https://huggingface.co/rhasspy/piper-voices/blob/main/nl/nl_NL/pim/medium/MODEL_CARD)
- [Piper Dutch Ronnie model card](https://huggingface.co/rhasspy/piper-voices/blob/main/nl/nl_NL/ronnie/medium/MODEL_CARD)
- [Piper Dutch MLS model card](https://huggingface.co/rhasspy/piper-voices/blob/main/nl/nl_NL/mls/medium/MODEL_CARD)
- [Piper English Amy model files](https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_US/amy/medium)

