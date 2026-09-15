"""Local faster-whisper worker for LMBook.

The Node host owns the process lifecycle and passes only allowlisted model
names.  This worker deliberately has two different modes: ``prepare`` is the
only mode allowed to contact Hugging Face, while ``status`` and ``transcribe``
are strictly local.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MODELS: dict[str, dict[str, str]] = {
    "large-v3": {
        "repo_id": "Systran/faster-whisper-large-v3",
        "revision": "53ecf83a5bedc5597eb8c8b34eac29e5345520ff",
    },
    "large-v3-turbo": {
        "repo_id": "dropbox-dash/faster-whisper-large-v3-turbo",
        "revision": "0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
    },
}
EXPECTED_FILES = (
    "config.json",
    "model.bin",
    "preprocessor_config.json",
    "tokenizer.json",
    "vocabulary.json",
)
MAX_MESSAGE_LENGTH = 1_000
MAX_SEGMENTS = 50_000
MAX_SECONDS = 24 * 60 * 60
_WINDOWS_DLL_HANDLES: list[Any] = []
_WINDOWS_CUDA_CHECKED = False
_WINDOWS_CUDA_ERROR: str | None = None


class WorkerError(RuntimeError):
    pass


def emit(kind: str, **payload: Any) -> None:
    """Write one bounded JSONL protocol record to stdout."""
    if "message" in payload:
        payload["message"] = str(payload["message"])[:MAX_MESSAGE_LENGTH]
    record = {"type": kind, **payload}
    print(json.dumps(record, ensure_ascii=False, allow_nan=False, separators=(",", ":")), flush=True)


def model_config(model: str) -> dict[str, str]:
    config = MODELS.get(model)
    if config is None:
        raise WorkerError(f"Unsupported transcription model: {model}")
    return config


def model_dir(models_root: Path, model: str) -> Path:
    model_config(model)
    return models_root / model


def marker_path(directory: Path) -> Path:
    return directory / ".download-complete"


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None
    return value if isinstance(value, dict) else None


def is_model_ready(models_root: Path, model: str, verify_hashes: bool = False) -> bool:
    config = model_config(model)
    directory = model_dir(models_root, model)
    marker = read_json(marker_path(directory))
    provenance = read_json(directory / "provenance.json")
    if not marker or marker.get("complete") is not True:
        return False
    if marker.get("repo_id") != config["repo_id"] or marker.get("revision") != config["revision"]:
        return False
    if not provenance or provenance.get("model") != model or provenance.get("repo_id") != config["repo_id"] or provenance.get("revision") != config["revision"]:
        return False
    recorded_files = {
        entry.get("path"): entry
        for entry in (provenance.get("files") or [])
        if isinstance(entry, dict)
    }
    for filename in EXPECTED_FILES:
        file_path = directory / filename
        entry = recorded_files.get(filename)
        if not file_path.is_file() or not isinstance(entry, dict) or entry.get("bytes") != file_path.stat().st_size:
            return False
        if verify_hashes and entry.get("sha256") != sha256_file(file_path):
            return False
    return True


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    os.replace(temporary, path)


def prepare(model: str, models_root: Path) -> None:
    config = model_config(model)
    models_root.mkdir(parents=True, exist_ok=True)
    directory = model_dir(models_root, model)
    if is_model_ready(models_root, model, verify_hashes=True):
        emit("progress", message=f"{model} is already prepared.")
        emit("ready", model=model, revision=config["revision"])
        return

    # Only remove partial directories created by this worker.  An incomplete
    # existing model directory is moved aside before the new snapshot becomes
    # visible, so a cancelled download never leaves a falsely complete model.
    for partial in models_root.glob(f".{model}.partial-*"):
        if partial.is_dir():
            shutil.rmtree(partial, ignore_errors=True)

    temporary = models_root / f".{model}.partial-{uuid.uuid4().hex}"
    temporary.mkdir(parents=True, exist_ok=False)
    previous: Path | None = None
    try:
        emit("progress", message=f"Downloading the pinned {model} model files…")
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        from huggingface_hub import HfApi, snapshot_download

        # Confirm that the pinned revision still exposes the exact files we
        # expect before starting a local snapshot. This is still preparation
        # time network activity; status/transcribe never contact the Hub.
        metadata = HfApi().model_info(
            repo_id=config["repo_id"],
            revision=config["revision"],
            files_metadata=False,
        )
        remote_files = {getattr(item, "rfilename", "") for item in (metadata.siblings or [])}
        missing_remote = [filename for filename in EXPECTED_FILES if filename not in remote_files]
        if missing_remote:
            raise WorkerError(f"Pinned model revision is missing {', '.join(missing_remote)}.")

        snapshot_download(
            repo_id=config["repo_id"],
            revision=config["revision"],
            local_dir=str(temporary),
            allow_patterns=list(EXPECTED_FILES),
        )
        missing = [filename for filename in EXPECTED_FILES if not (temporary / filename).is_file()]
        if missing:
            raise WorkerError(f"Pinned model download is incomplete; missing {', '.join(missing)}.")
        shutil.rmtree(temporary / ".cache", ignore_errors=True)

        files = []
        for filename in EXPECTED_FILES:
            file_path = temporary / filename
            files.append({
                "path": filename,
                "bytes": file_path.stat().st_size,
                "sha256": sha256_file(file_path),
            })
        provenance = {
            "provider": "huggingface",
            "repo_id": config["repo_id"],
            "revision": config["revision"],
            "model": model,
            "files": files,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        write_json_atomic(temporary / "provenance.json", provenance)
        write_json_atomic(temporary / ".download-complete", {
            "complete": True,
            "model": model,
            "repo_id": config["repo_id"],
            "revision": config["revision"],
            "files": [entry["path"] for entry in files],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })

        if directory.exists():
            previous = models_root / f".{model}.previous-{uuid.uuid4().hex}"
            os.replace(directory, previous)
        try:
            os.replace(temporary, directory)
        except Exception:
            # Restore the last complete or user-visible directory if the
            # final rename is interrupted, while leaving the partial snapshot
            # unavailable for future transcription.
            if previous is not None and not directory.exists():
                os.replace(previous, directory)
                previous = None
            raise
        if previous is not None:
            shutil.rmtree(previous, ignore_errors=True)
        emit("progress", message=f"{model} is ready for offline transcription.")
        emit("ready", model=model, revision=config["revision"])
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def configure_windows_cuda_dlls() -> str | None:
    """Register only NVIDIA DLL folders owned by this worker's venv."""
    global _WINDOWS_CUDA_CHECKED, _WINDOWS_CUDA_ERROR
    if os.name != "nt":
        return None
    if _WINDOWS_CUDA_CHECKED:
        return _WINDOWS_CUDA_ERROR
    _WINDOWS_CUDA_CHECKED = True
    try:
        prefix = Path(sys.prefix).resolve()
        site_packages = (prefix / "Lib" / "site-packages").resolve()
        site_packages.relative_to(prefix)
        candidates = [
            site_packages / "nvidia" / "cuda_runtime" / "bin",
            site_packages / "nvidia" / "cublas" / "bin",
            site_packages / "nvidia" / "cudnn" / "bin",
        ]
        managed_dirs: list[Path] = []
        for candidate in candidates:
            resolved = candidate.resolve()
            try:
                resolved.relative_to(site_packages)
            except ValueError:
                continue
            if resolved.is_dir():
                managed_dirs.append(resolved)
        if not managed_dirs:
            _WINDOWS_CUDA_ERROR = "Windows CUDA DLLs are missing from the managed transcription venv; an NVIDIA driver alone is insufficient."
            return _WINDOWS_CUDA_ERROR

        existing_path = os.environ.get("PATH", "")
        os.environ["PATH"] = os.pathsep.join([str(directory) for directory in managed_dirs] + [existing_path])
        for directory in managed_dirs:
            _WINDOWS_DLL_HANDLES.append(os.add_dll_directory(str(directory)))

        import ctypes

        required_dlls = {
            "cuBLAS": ("cublas64_12.dll",),
            "cuDNN": ("cudnn64_9.dll", "cudnn_ops64_9.dll", "cudnn_ops_infer64_9.dll"),
        }
        for label, names in required_dlls.items():
            loaded = False
            last_error: OSError | None = None
            for name in names:
                try:
                    ctypes.WinDLL(name)
                    loaded = True
                    break
                except OSError as error:
                    last_error = error
            if not loaded:
                detail = str(last_error) if last_error else "DLL could not be loaded"
                _WINDOWS_CUDA_ERROR = f"{label} DLLs are not loadable from the managed venv ({detail}); an NVIDIA driver alone is insufficient."
                return _WINDOWS_CUDA_ERROR
    except Exception as error:
        _WINDOWS_CUDA_ERROR = f"Windows CUDA DLL setup is unavailable: {str(error)[:MAX_MESSAGE_LENGTH]}"
        return _WINDOWS_CUDA_ERROR
    return None


def cuda_support(dll_error: str | None = None) -> tuple[bool, str | None]:
    dll_error = dll_error if dll_error is not None else configure_windows_cuda_dlls()
    if dll_error:
        return False, dll_error
    try:
        import ctranslate2

        supported = ctranslate2.get_supported_compute_types("cuda")
        if supported:
            return True, None
        return False, "The installed CTranslate2 runtime reports no CUDA compute types."
    except Exception as error:  # Import errors include missing CUDA DLLs on Windows.
        return False, str(error)[:MAX_MESSAGE_LENGTH]


def status(models_root: Path) -> None:
    models = {name: is_model_ready(models_root, name) for name in MODELS}
    dll_error = configure_windows_cuda_dlls()
    try:
        import faster_whisper  # noqa: F401
        import ctranslate2  # noqa: F401
    except Exception as error:
        emit(
            "status",
            runtime=False,
            cuda=False,
            models=models,
            message=f"Transcription runtime is incomplete: {str(error)[:MAX_MESSAGE_LENGTH]}" + (f" CUDA check: {dll_error}" if dll_error else ""),
        )
        return
    cuda, cuda_error = cuda_support(dll_error)
    message = "Transcription runtime is ready."
    if not cuda:
        detail = f" ({cuda_error})" if cuda_error else ""
        message = f"CUDA is unavailable; CPU fallback is available{detail}."
    emit("status", runtime=True, cuda=cuda, models=models, message=message)


def finite_seconds(value: Any, label: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise WorkerError(f"Invalid {label} timestamp.") from error
    if not math.isfinite(result) or result < 0 or result > MAX_SECONDS:
        raise WorkerError(f"Invalid {label} timestamp.")
    return result


def make_model(model_path: Path, requested_device: str) -> tuple[Any, str]:
    cuda_error: str | None = None
    if requested_device in ("auto", "cuda"):
        cuda, detail = cuda_support()
        cuda_error = detail
        if cuda:
            from faster_whisper import WhisperModel

            def load(device: str, compute_type: str) -> Any:
                return WhisperModel(str(model_path), device=device, compute_type=compute_type, local_files_only=True)

            try:
                return load("cuda", "float16"), "cuda/float16"
            except Exception as error:
                if requested_device == "cuda":
                    raise WorkerError(f"CUDA transcription unavailable: {str(error)[:MAX_MESSAGE_LENGTH]}") from error
                emit("progress", message="CUDA could not start; falling back to CPU INT8.")
        elif requested_device == "cuda":
            suffix = f": {detail}" if detail else ""
            raise WorkerError(f"CUDA transcription unavailable{suffix}.")
        else:
            emit("progress", message="CUDA is unavailable; using CPU INT8.")
    from faster_whisper import WhisperModel

    def load(device: str, compute_type: str) -> Any:
        # local_files_only is intentional: transcribe mode must never turn a
        # missing model or network outage into an implicit download.
        return WhisperModel(
            str(model_path),
            device=device,
            compute_type=compute_type,
            local_files_only=True,
        )

    try:
        return load("cpu", "int8"), "cpu/int8"
    except Exception as error:
        raise WorkerError(f"CPU transcription unavailable: {str(error)[:MAX_MESSAGE_LENGTH]}") from error


def transcribe(model: str, models_root: Path, audio_path: Path, language: str, device: str) -> None:
    if not audio_path.is_file():
        raise WorkerError("The source audio file does not exist.")
    if not is_model_ready(models_root, model, verify_hashes=True):
        raise WorkerError(f"The {model} model is not prepared. Run transcription setup first.")

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    model_instance, device_label = make_model(model_dir(models_root, model), device)
    emit("progress", message="Transcribing audio with word timestamps…")
    requested_language = None if language == "auto" else language
    try:
        segments_iterator, info = model_instance.transcribe(
            str(audio_path),
            language=requested_language,
            task="transcribe",
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
        )
    except Exception as error:
        raise WorkerError(f"Audio transcription failed: {str(error)[:MAX_MESSAGE_LENGTH]}") from error

    duration = getattr(info, "duration", None)
    try:
        duration_value = float(duration) if duration is not None else 0.0
    except (TypeError, ValueError):
        duration_value = 0.0
    transcript_segments: list[dict[str, Any]] = []
    for index, segment in enumerate(segments_iterator, start=1):
        if index > MAX_SEGMENTS:
            raise WorkerError("The transcript exceeded the 50,000 segment safety limit.")
        text = str(getattr(segment, "text", "") or "").strip()
        if not text:
            continue
        if len(text) > 12_000:
            raise WorkerError("The transcription returned a segment longer than the 12,000 character limit.")
        start = finite_seconds(getattr(segment, "start", 0), "segment start")
        end = finite_seconds(getattr(segment, "end", start), "segment end")
        if end < start:
            raise WorkerError("The transcription provider returned out-of-order timestamps.")
        words: list[dict[str, Any]] = []
        raw_words = getattr(segment, "words", None) or []
        for raw_word in raw_words:
            raw_start = getattr(raw_word, "start", None)
            raw_end = getattr(raw_word, "end", None)
            if raw_start is None or raw_end is None:
                continue
            word_start = finite_seconds(raw_start, "word start")
            word_end = finite_seconds(raw_end, "word end")
            if word_end < word_start:
                continue
            word_text = str(getattr(raw_word, "word", "") or "")
            if len(word_text) > 500:
                raise WorkerError("The transcription returned a word longer than the 500 character limit.")
            word = {"start": word_start, "end": word_end, "text": word_text}
            probability = getattr(raw_word, "probability", None)
            try:
                probability_value = float(probability) if probability is not None else None
            except (TypeError, ValueError):
                probability_value = None
            if probability_value is not None and math.isfinite(probability_value) and 0 <= probability_value <= 1:
                word["probability"] = probability_value
            if len(words) >= 3_000:
                raise WorkerError("The transcription returned more than 3,000 words in one segment.")
            words.append(word)
        item: dict[str, Any] = {"start": start, "end": end, "text": text}
        if words:
            item["words"] = words
        transcript_segments.append(item)
        if duration_value > 0:
            percent = min(100, max(0, round(end / duration_value * 100)))
            emit("progress", message=f"Transcribed {percent}% ({end:.1f}s of {duration_value:.1f}s).")
        elif index % 10 == 0:
            emit("progress", message=f"Transcribed {index} segments.")
    if not transcript_segments:
        raise WorkerError("The transcription returned no speech segments.")
    detected_language = str(getattr(info, "language", None) or language or "unknown")
    if len(detected_language) > 30:
        raise WorkerError("The transcription returned an invalid language identifier.")
    emit(
        "result",
        transcript={
            "provider": "faster-whisper",
            "model": model,
            "revision": model_config(model)["revision"],
            "language": detected_language,
            "device": device_label,
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "segments": transcript_segments,
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LMBook local transcription worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("status", "prepare"):
        subparser = subparsers.add_parser(command)
        subparser.add_argument("--model", choices=tuple(MODELS), required=command == "prepare")
        subparser.add_argument("--models-root", required=True)
    transcribe_parser = subparsers.add_parser("transcribe")
    transcribe_parser.add_argument("--model", choices=tuple(MODELS), required=True)
    transcribe_parser.add_argument("--models-root", required=True)
    transcribe_parser.add_argument("--audio-path", required=True)
    transcribe_parser.add_argument("--language", choices=("auto", "en", "nl"), default="auto")
    transcribe_parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    models_root = Path(arguments.models_root).resolve()
    try:
        if arguments.command == "status":
            status(models_root)
        elif arguments.command == "prepare":
            prepare(arguments.model, models_root)
        else:
            transcribe(
                arguments.model,
                models_root,
                Path(arguments.audio_path).resolve(),
                arguments.language,
                arguments.device,
            )
        return 0
    except WorkerError as error:
        emit("error", message=str(error)[:MAX_MESSAGE_LENGTH])
        return 1
    except Exception as error:
        emit("error", message=f"Transcription worker failed: {str(error)[:MAX_MESSAGE_LENGTH]}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
