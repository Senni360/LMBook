"""Pinned multilingual-e5-small runtime used only for on-device embeddings.

The process is intentionally a small JSONL worker. It never receives vault paths,
never writes vault files, and only contacts Hugging Face in ``prepare`` mode.
"""
from __future__ import annotations
import argparse, json, os, sys, threading
from pathlib import Path
from typing import Any

MODEL = "intfloat/multilingual-e5-small"
REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"

def emit(record: dict[str, Any]) -> None:
    print(json.dumps(record, ensure_ascii=False, separators=(",", ":")), flush=True)

def model_dir(root: Path) -> Path:
    return root / "multilingual-e5-small"

def ready(root: Path) -> bool:
    d = model_dir(root)
    try:
        marker = json.loads((d / ".download-complete").read_text())
        weights = list(d.glob("*.safetensors")) + list(d.glob("*.bin"))
        return marker.get("complete") is True and marker.get("revision") == REVISION and (d / "config.json").is_file() and (d / "tokenizer.json").is_file() and bool(weights)
    except (OSError, ValueError):
        return False

def prepare(root: Path) -> None:
    from huggingface_hub import snapshot_download
    d = model_dir(root); d.mkdir(parents=True, exist_ok=True)
    emit({"type": "progress", "message": "Connecting to the model download…", "progress": None})
    stopped = threading.Event()
    def report_download() -> None:
        while not stopped.wait(1):
            files = list(d.glob("*")) + list((d / ".cache" / "huggingface" / "download").glob("*.incomplete"))
            received = 0
            for file in files:
                try:
                    if file.is_file(): received += file.stat().st_size
                except OSError: pass  # A completed download can be renamed mid-scan.
            emit({"type": "progress", "message": f"Downloading model files · {received / 1024**2:.1f} MB received", "progress": None})
    reporter = threading.Thread(target=report_download, daemon=True)
    reporter.start()
    try:
        snapshot_download(MODEL, revision=REVISION, local_dir=str(d),
                          allow_patterns=["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "sentencepiece.bpe.model"],
                          max_workers=2)
    finally:
        stopped.set(); reporter.join(timeout=2)
    if not (d / "config.json").is_file() or not (d / "tokenizer.json").is_file() or not list(d.glob("*.safetensors")):
        raise RuntimeError("The downloaded checkpoint is missing required model or tokenizer files.")
    (d / ".download-complete").write_text(json.dumps({"complete": True, "model": MODEL, "revision": REVISION}), encoding="utf8")
    emit({"type": "progress", "message": "Model download complete.", "progress": 1})

def imports() -> tuple[Any, Any, Any]:
    import torch
    from transformers import AutoModel, AutoTokenizer
    return torch, AutoModel, AutoTokenizer

def worker(root: Path) -> None:
    if not ready(root): raise RuntimeError("The multilingual model is not prepared for offline use.")
    torch, AutoModel, AutoTokenizer = imports()
    d = str(model_dir(root))
    tokenizer = AutoTokenizer.from_pretrained(d, local_files_only=True, trust_remote_code=False)
    model = AutoModel.from_pretrained(d, local_files_only=True, trust_remote_code=False, use_safetensors=True)
    model.eval(); torch.set_num_threads(min(4, os.cpu_count() or 1)); torch.set_num_interop_threads(1)
    emit({"type": "ready", "runtime": True, "model": MODEL})
    for line in sys.stdin:
        req: Any = None
        try:
            req = json.loads(line); rid = req.get("id")
            if req.get("op") != "embed" or not isinstance(req.get("texts"), list): raise ValueError("Invalid embedding request.")
            texts = req["texts"]
            if not texts or len(texts) > 32 or any(not isinstance(x, str) or not x or len(x) > 16000 for x in texts) or sum(map(len, texts)) > 64000: raise ValueError("Embedding request is too large.")
            kind = req.get("kind", "query")
            if kind not in ("query", "passage"): raise ValueError("Invalid embedding kind.")
            # E5 has a 512-token window. Split long inputs into overlapping
            # windows and pool all windows, so no source text is silently lost.
            windows = []; owners = []
            prefix = tokenizer.encode(f"{kind}: ", add_special_tokens=False)
            capacity = 510 - len(prefix)
            for owner, text in enumerate(texts):
                ids = tokenizer.encode(text, add_special_tokens=False)
                for offset in range(0, max(1, len(ids)), capacity - 48):
                    part = ids[offset:offset + capacity]
                    if not part and offset > 0: break
                    windows.append(tokenizer.prepare_for_model(prefix + part, add_special_tokens=True, return_attention_mask=True, return_token_type_ids=False)); owners.append(owner)
                    if offset + capacity >= len(ids): break
            sums = [None] * len(texts); counts = [0] * len(texts)
            for offset in range(0, len(windows), 8):
                batch = tokenizer.pad(windows[offset:offset + 8], padding=True, return_tensors="pt")
                with torch.inference_mode():
                    hidden = model(**batch).last_hidden_state
                    mask = batch["attention_mask"].unsqueeze(-1)
                    pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1)
                for index, vector in enumerate(pooled):
                    owner = owners[offset + index]; sums[owner] = vector if sums[owner] is None else sums[owner] + vector; counts[owner] += 1
            vectors = [torch.nn.functional.normalize(sums[i] / counts[i], p=2, dim=0).cpu().tolist() for i in range(len(texts))]
            emit({"type": "result", "id": rid, "vectors": vectors})
        except Exception as exc:
            emit({"type": "error", "id": req.get("id") if isinstance(req, dict) else None, "message": str(exc)[:1000]})

def smoke(root: Path) -> None:
    if not ready(root): raise RuntimeError("The multilingual model is not prepared for offline use.")
    torch, AutoModel, AutoTokenizer = imports()
    d = str(model_dir(root)); tokenizer = AutoTokenizer.from_pretrained(d, local_files_only=True, trust_remote_code=False)
    model = AutoModel.from_pretrained(d, local_files_only=True, trust_remote_code=False, use_safetensors=True); model.eval()
    encoded = tokenizer("query: LMBook local search", return_tensors="pt", truncation=False)
    with torch.inference_mode():
        hidden = model(**encoded).last_hidden_state; mask = encoded["attention_mask"].unsqueeze(-1)
        vector = torch.nn.functional.normalize((hidden * mask).sum(dim=1) / mask.sum(dim=1), p=2, dim=1)
    if not vector.isfinite().all(): raise RuntimeError("Offline embedding smoke query returned a non-finite vector.")
    emit({"type": "smoke", "ok": True})

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("mode", choices=("status", "prepare", "worker", "smoke")); parser.add_argument("--models-root", required=True)
    args = parser.parse_args(); root = Path(args.models_root)
    if args.mode == "status":
        try: imports(); runtime = True; message = "Local embedding runtime is available."
        except Exception as exc: runtime = False; message = f"Local embedding runtime is unavailable: {exc}"
        emit({"type": "status", "runtime": runtime, "ready": ready(root), "message": message}); return
    if args.mode == "prepare": prepare(root)
    elif args.mode == "smoke": smoke(root)
    else: worker(root)

if __name__ == "__main__":
    try: main()
    except Exception as exc:
        emit({"type": "error", "message": str(exc)[:1000]}); raise
