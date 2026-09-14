# Local transcription for SenniBook

_Research date: 2026-09-14. Scope: local English and Dutch transcription on Windows with an RTX 3060 or RTX 3080, including word and segment timestamps._

## Recommendation

Build the first local provider around Python `faster-whisper`, with an explicit model choice:

| Choice                 | Use                                                      | Recommendation                                                             |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `large-v3`             | Highest-confidence default for source-grounded work      | Default model                                                              |
| `large-v3-turbo`       | Faster drafts and previews with a small quality tradeoff | Optional speed model, pinned to an exact conversion/revision               |
| `parakeet-tdt-0.6b-v3` | Fast multilingual alternative and a future cross-check   | Add as a second provider through NVIDIA's native `NeMo-Speech.cpp` runtime |

`faster-whisper` already exposes the Python seam the app needs: local file input, language selection, segment timestamps, word timestamps, VAD, GPU execution, and CPU INT8 fallback. Its official examples use `large-v3` on CUDA with FP16 or INT8-FP16 and CPU INT8, and its package can load a local model directory after the first download. [`faster-whisper` usage and timestamp examples](https://github.com/SYSTRAN/faster-whisper#usage) show the relevant API.

Whisper's `large-v3` and `turbo` are multilingual; the official tokenizer includes `nl` as Dutch. OpenAI describes `large-v3-turbo` as a pruned, four-decoder-layer version of `large-v3`: faster, with a minor quality degradation. The model supports sentence or word timestamps. [`Whisper tokenizer language list`](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py), [`openai/whisper-large-v3-turbo`](https://huggingface.co/openai/whisper-large-v3-turbo), and [`OpenAI's Whisper model card`](https://github.com/openai/whisper/blob/main/model-card.md) are the source references.

Parakeet is now a serious optional choice for this use case. NVIDIA's `parakeet-tdt-0.6b-v3` explicitly supports Dutch and English among 25 European languages, detects the language automatically, and returns word and segment timestamps. Its model card lists NeMo's supported operating system as Linux, so the Python NeMo path should be treated as a WSL/Linux option on Windows. NVIDIA's native [`NeMo-Speech.cpp`](https://github.com/NVIDIA/NeMo-Speech.cpp) runtime is the Windows-friendly path: its installer supports Windows, its model list includes Parakeet v3, and it has CPU and CUDA backends. [`Parakeet v3 model card`](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) and [`NeMo-Speech.cpp README`](https://github.com/NVIDIA/NeMo-Speech.cpp) document this split.

Keeping the first provider in Python reduces the first integration surface. Add Parakeet after the transcript schema and worker lifecycle are stable; then it can serve as a speed option or an independent transcript for later cross-checking without changing source extraction or the reasoning provider.

## Hardware and runtime constraints

NVIDIA lists the RTX 3060 and RTX 3080 as Ampere GPUs with CUDA capability 8.6. CTranslate2 supports CUDA GPUs with capability 7.0 or newer and supports `float16` and `int8_float16` compute types for that range. [`RTX 3060 specifications`](https://www.nvidia.com/en-us/geforce/graphics-cards/30-series/rtx-3060-3060ti/), [`RTX 3080 specifications`](https://www.nvidia.com/en-au/geforce/graphics-cards/30-series/rtx-3080-3080ti/), and [`CTranslate2 quantization support`](https://github.com/OpenNMT/CTranslate2/blob/master/docs/quantization.md) support the compatibility decision.

Use batch size 1 initially. The current `faster-whisper` benchmark on an 8 GB RTX 3070 Ti reports about 4.5 GB GPU memory for `large-v2` FP16 and 2.9 GB for INT8; this is a planning reference rather than a guarantee for `large-v3`, Windows desktop use, or long-file settings. Start with CUDA FP16, then fall back to `int8_float16` when the user has a smaller/shared GPU or an out-of-memory error. [`faster-whisper benchmark and GPU requirements`](https://github.com/SYSTRAN/faster-whisper#large-v2-model-on-gpu) also documents that the current CUDA path needs cuBLAS and cuDNN.

Pin the Python runtime and check the installed compatibility rather than assuming that any CUDA toolkit will work. The current `faster-whisper` README says recent CTranslate2 wheels use CUDA 12 and cuDNN 9, with older-version workarounds for CUDA 11/cuDNN 8 and CUDA 12/cuDNN 8. The CTranslate2 installation page says Windows wheels support GPU execution with CUDA 12 and notes that speech models with convolutional layers also need cuDNN. This documentation is version-sensitive, so the worker's setup check should report the installed `ctranslate2` version, CUDA availability, supported compute types, and missing DLL names. [`faster-whisper GPU requirements`](https://github.com/SYSTRAN/faster-whisper#gpu) and [`CTranslate2 installation`](https://github.com/OpenNMT/CTranslate2/blob/master/docs/installation.md) are the authoritative references.

Python 3.13 is currently viable on Windows: PyPI publishes `faster-whisper` 1.2.1 as a universal Python wheel and CTranslate2 4.8.2 as a `cp313-win_amd64` wheel. Install both in an isolated worker environment and pin the resolved versions; do not rely on an older 2025 issue that predates the current CTranslate2 wheel. [`faster-whisper on PyPI`](https://pypi.org/project/faster-whisper/) and [`CTranslate2 on PyPI`](https://pypi.org/project/ctranslate2/) show the current wheel metadata.

CPU fallback is practical for the same worker: use `device="cpu", compute_type="int8"`. Surface that the fallback will have lower throughput and keep the job resumable. Do not silently switch to a hosted API or upload local audio when CUDA is unavailable.

### Windows GPU setup without a CUDA toolkit

An NVIDIA display driver is necessary but does not by itself provide the user-mode cuBLAS and cuDNN DLLs required by CTranslate2. NVIDIA's current Windows installation guide supports CUDA runtime Python wheels from PyPI, and the cuDNN Windows guide documents the corresponding `nvidia-cudnn-cu12` wheel. The current stable Windows wheels observed on 2026-09-14 are:

```text
nvidia-cuda-runtime-cu12==12.9.79
nvidia-cublas-cu12==12.9.2.10
nvidia-cudnn-cu12==9.26.0.51
```

They are large, NVIDIA-proprietary runtime packages: the cuBLAS and cuDNN wheels are each hundreds of megabytes. Install them only in the transcription venv, alongside the pinned `ctranslate2==4.8.2`; do not add their directories to the user's global `PATH`. The exact Windows wheels and their hashes are listed on the [CUDA runtime package](https://pypi.org/project/nvidia-cuda-runtime-cu12/12.9.79/), [cuBLAS package](https://pypi.org/project/nvidia-cublas-cu12/12.9.2.10/), and [cuDNN package](https://pypi.org/project/nvidia-cudnn-cu12/9.26.0.51/) pages. NVIDIA's [Windows CUDA installation guide](https://docs.nvidia.com/cuda/cuda-installation-guide-microsoft-windows/) explains the pip-wheel approach and its runtime-only scope.

The current [faster-whisper GPU guidance](https://github.com/SYSTRAN/faster-whisper#gpu) pairs current CTranslate2 releases with CUDA 12 and cuDNN 9. The older cuDNN 8 combinations in that page are downgrade paths, not an additional dependency to install beside `ctranslate2==4.8.2`; mixing the two families is a common source of missing `*_8.dll` and `*_9.dll` errors.

The worker must register the venv's DLL directories before importing `ctranslate2` or `faster_whisper`. On Python 3.8 and later, keep the handles returned by `os.add_dll_directory` alive for the process:

```python
_DLL_HANDLES = []
if sys.platform == "win32":
    site = Path(sys.prefix) / "Lib" / "site-packages"
    for relative in ("nvidia/cuda_runtime/bin", "nvidia/cublas/bin", "nvidia/cudnn/bin"):
        directory = site / relative
        if directory.is_dir():
            _DLL_HANDLES.append(os.add_dll_directory(str(directory)))
```

The package names and directories should be checked after installation because NVIDIA can change wheel layouts. If the isolated wheels cannot load on a particular Windows machine, the guided fallback is NVIDIA's official CUDA/cuDNN installation for Windows, followed by a worker-specific DLL path; keep CPU INT8 available when that setup is not worth the disk space or administrative work. CUDA 12 applications require a compatible driver; NVIDIA's compatibility table lists Windows driver 527.41 as the minimum for CUDA 12.0 and documents the broader CUDA 12.x driver range. [`CUDA minor-version compatibility`](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html) and [`cuDNN Windows installation`](https://docs.nvidia.com/deeplearning/cudnn/backend/v9.2.1/installation/windows.html) are the relevant primary references.

`ctranslate2.get_supported_compute_types("cuda")` is a useful bounded capability check, but it is not a proof that a transcription can run. CUDA and cuDNN loading is partly lazy, so a machine can report CUDA compute types and then fail when a Whisper model performs its first convolution, with errors such as a missing `cudnn_ops_infer64_9.dll`, missing cuBLAS DLL, or an insufficient driver. Keep three states in the setup UI: Python/runtime importable, CUDA capability reported, and CUDA transcription validated. After the user explicitly prepares a model, validate the third state by launching the same worker with a short local WAV, `device="cuda"`, and iterating at least one segment. Record the first bounded stderr/exception message and expose it beside the CPU fallback. A failed validation should not mark the model corrupt or contact a hosted provider.

## Model and license choices

- The `faster-whisper` runtime is MIT licensed, as is CTranslate2. The official Systran CTranslate2 conversion of `large-v3` is also marked MIT. Preserve the runtime and model notices in any packaged worker. [`faster-whisper license`](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE), [`CTranslate2 license`](https://github.com/OpenNMT/CTranslate2/blob/master/LICENSE), and [`Systran large-v3 conversion`](https://huggingface.co/Systran/faster-whisper-large-v3) are the relevant sources.
- OpenAI's `whisper-large-v3-turbo` Hub card currently lists MIT metadata, while the original OpenAI Whisper repository code is MIT. Keep the exact checkpoint identifier and license metadata alongside the downloaded model rather than treating every Whisper conversion as interchangeable. [`Whisper turbo model card`](https://huggingface.co/openai/whisper-large-v3-turbo) and [`OpenAI Whisper license`](https://github.com/openai/whisper/blob/main/LICENSE) provide the source notices.
- NVIDIA's Parakeet v3 model is governed by CC BY 4.0. NVIDIA's NeMo-Speech.cpp runtime is Apache-2.0, but its model and third-party notices still need to ship with the model cache or installer. [`Parakeet v3 license and card`](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) and [`NeMo-Speech.cpp license`](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/LICENSE) are the source references.

## Model download and cache semantics

Treat model download as an explicit setup operation, never as an unbounded side effect of importing an audio file.

1. Keep an allowlist mapping the user-facing model choice to a repository ID, exact revision, expected runtime, and license. Prefer the official `Systran/faster-whisper-large-v3` conversion for the default. The package's short model names auto-download from the Hugging Face Hub, but the worker should download to a known app cache and then load that local path.
2. Use `huggingface_hub.snapshot_download(repo_id=..., revision=<full commit>, local_dir=..., allow_patterns=...)`. The Hub documentation supports full commit revisions, local directories, cache metadata, and `local_files_only=True` for offline startup. Record `repo_id`, full revision, file names, file sizes, and SHA-256 in a small manifest next to the model. [`Hugging Face download API`](https://huggingface.co/docs/huggingface_hub/package_reference/file_download) documents these semantics.
3. Download into a temporary directory, verify the manifest, then atomically rename it into the active model directory. A second worker must either wait for the cache lock or use the previous complete version; it must never load a half-downloaded model.
4. On normal transcription, pass the local model path and use offline/local-only mode. If files are missing, return a setup error naming the model and cache path. Do not reach the network from a transcription job.
5. For Parakeet through `NeMo-Speech.cpp`, `nemo-speech pull` is a useful alternative: its CLI uses a Windows cache under `%LOCALAPPDATA%\NeMoSpeech\models`, resumes regular-file downloads, verifies pinned size and SHA-256, and supports an existing local GGUF path without network access. [`NeMo-Speech.cpp CLI model cache`](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/cli.md#models-and-cache) documents this behavior.

## Worker contract

Keep the Node-to-Python boundary line-oriented and explicit. A first worker can accept one request on stdin and emit progress/result JSON on stdout; diagnostics belong on stderr.

Request shape:

```json
{
  "jobId": "uuid",
  "audioPath": "C:\\...\\media\\recording.wav",
  "model": "large-v3",
  "language": "en",
  "device": "auto",
  "modelDir": "C:\\...\\models\\faster-whisper-large-v3\\<revision>"
}
```

The Node side should pass an argument array or stdin, never interpolate paths into a shell command. Validate that `audioPath` is inside the app's managed media directory. Let `language` be `en`, `nl`, or `auto`; for known source language, pass it to Whisper to avoid unnecessary language detection. Use `task="transcribe"`, `word_timestamps=True`, and `vad_filter=True`. For long recordings, consume the returned segment generator incrementally and emit progress after each segment; the official library warns that transcription begins only when the generator is iterated. [`faster-whisper transcription API`](https://github.com/SYSTRAN/faster-whisper#faster-whisper) documents the generator, language information, word timestamps, and VAD.

Normalize every provider into one versioned result shape:

```json
{
  "schemaVersion": 1,
  "provider": "faster-whisper",
  "model": "large-v3",
  "revision": "<full model revision>",
  "language": "nl",
  "segments": [
    {
      "id": 0,
      "start": 12.34,
      "end": 16.78,
      "text": "...",
      "words": [{ "start": 12.34, "end": 12.91, "text": "..." }]
    }
  ]
}
```

Do not require speaker labels in the first schema. A single audio track may contain two speakers, and diarization is a separate accuracy choice. Reserve optional `speaker` on words or segments for a later provider. Preserve the original audio path and a SHA-256 of the input in the job metadata, not in every segment.

Write the result to a temporary JSON file and rename it only after the worker exits successfully and the final JSON parses. Store the provider, model, revision, language mode, device/compute type, audio hash, and timestamp in the cache key. Cancellation should terminate the worker and remove only its temporary output; a completed transcript remains immutable and can be reused when that key matches.

For Parakeet v3, either parse the NeMo Python result's `timestamp['word']` and `timestamp['segment']` arrays or call the native CLI with `--json`. The CLI writes diagnostics to stderr, requests word timestamps for JSON/SRT/WebVTT, accepts local WAV input, and can select `--device cuda:0` or `--device cpu`. It is offline-only for Parakeet TDT, so do not pass streaming flags to it. [`NeMo-Speech.cpp timestamp and JSON output`](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/cli.md#subtitles-and-structured-output) and [`Parakeet timestamp API`](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3#transcribing-with-timestamps) show the provider-specific details.

## Practical rollout

1. Add a setup check that reports Python, `faster-whisper`, CTranslate2, CUDA/cuDNN availability, selected GPU, supported compute types, model cache state, and whether the requested model revision is present.
2. Ship one provider first: `large-v3` with GPU FP16, GPU INT8-FP16 fallback, and CPU INT8 fallback. Add `large-v3-turbo` as a selectable speed model after a small English/Dutch acceptance set confirms names, numbers, Dutch compounds, and chapter boundaries.
3. Store timestamped transcripts as local source artifacts. Let later objective/source reasoning consume the transcript with time ranges and audio references, so a future multimodal cross-check can compare a claim against the exact audio window without coupling the ASR worker to the LLM provider.
4. Add Parakeet v3 as a separate provider once the worker protocol is stable. On Windows, prefer the native NeMo-Speech.cpp path; on Linux/WSL, evaluate the Python NeMo path as well. Compare both providers on the same local acceptance set rather than choosing from benchmark numbers alone.
