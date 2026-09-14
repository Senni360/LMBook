# SenniBook

A local, open-source learning notebook for detailed two-person audio in Dutch and English. Bring your sources, begrippen and leerdoelen; inspect the evidence; shape the conversation.

## Windows desktop edition

Build the installer with `npm run desktop:dist`, or launch the desktop app from source with `npm run desktop`. Build artifacts go to `release/`: an installer, a portable executable, and `win-unpacked/SenniBook.exe`.

The checked 0.2.2 preview is under `release/0.2.2/`. Quit an older running preview before opening `SenniBook-0.2.2-portable.exe`; both use the same normal application-data library. This build used the installed matching Electron runtime after Windows blocked the builder's archive-directory rename. The exact fallback command is in WORKLOG.md.

The installed app includes its runtime and starts the learning engine automatically. It stores notebooks under `%APPDATA%/SenniBook/data` (the exact folder appears in Connections & settings). The original browser edition's `data/` folder stays untouched. Provider accounts and optional external CLIs still need to be configured separately.

The desktop interface uses a stable private app address, a sandboxed renderer and a per-launch backend token. External documentation opens in your normal browser. If generation is active when you close the window, you can keep working in the tray or cancel and quit. Completed work is saved. The app prevents automatic system sleep while generation is active; it cannot keep a powered-off computer working.

These local builds are unsigned. A signing identity and release destination have not been configured; automatic updates are not yet enabled.

## Run locally

Requires Node.js 24 or newer. In this folder:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://127.0.0.1:4317. The server is deliberately bound to localhost. This edition has no user accounts and must not be exposed to the internet. Stop it with Ctrl+C. To run the compiled frontend, use `npm run build` followed by `npm start`.

## First notebook

1. Create a notebook, or explore the clearly labelled illustrative example.
2. Upload PDF, DOCX, HTML, PPTX, Markdown, `.markdown`, TXT or CSV files, or PNG/JPEG images (20 MB each), or import an audio recording up to 500 MB. PDF import uses the text layer first and can optionally run bundled local Tesseract OCR across all pages; printed English, Dutch and bilingual pages are supported without Python. Document extraction is bounded at 600 PDF pages and 1 million extracted characters. Extracted source text and the original binary are persisted locally; audio recordings remain available for playback and transcription.
3. Paste learning objectives and concepts, one per line. Alternatively upload a goals document as a source and extract its explicit objectives with your configured model.
4. Map coverage. Proposed verbatim quotes are checked against the original text. This is not a correctness guarantee. Gap searches open in your browser; add supplemental sources yourself.
5. In Audio studio choose subject, language, assumed knowledge, depth, purpose and target duration. Plan an outline, write chapter scripts, inspect/edit them, then generate a short voice preview or the complete episode.

AI operations are real provider calls, not simulated results. No provider call occurs merely by opening a notebook. Your uploaded material is sent to the selected provider only when requesting analysis, chat or episode generation. Speech generation sends the script to Google Cloud.

## Thinking providers

### Codex CLI

The Windows npm-installed CLI is detected automatically. Run `codex login` in your terminal first. An alternative CLI JavaScript path can be set with `CODEX_CLI_PATH`. SenniBook uses `codex exec`, a temporary working directory, read-only sandbox and existing authentication. It ignores personal Codex configuration for predictable behavior. Subscription/account limits apply. The CLI adapter is optional; this repository does not promise account eligibility or unlimited use.

### OpenCode Go

Install OpenCode, connect your Go account, and select OpenCode Go in Settings. SenniBook can reuse that local CLI login without copying its key. The CLI defaults to `muse-spark-1.3-contributor`, disables tools for generation, and sends the complete bounded request through standard input. This avoids the CLI attachment reader truncating long source material. Set `OPENCODE_CLI_PATH` if the executable is installed outside the detected npm location.

Alternatively set `OPENCODE_API_KEY` in `.env` and enter a model ID with a `/chat/completions` endpoint from the [provider documentation](https://opencode.ai/docs/go/). This direct API mode takes precedence over CLI login. Models using `/messages` or `/responses` are only supported through the CLI adapter. No silent fallback to another paid service occurs.

### Ollama

Run a local Ollama server, install a suitable model, and select it in Settings. Default model: `qwen3:8b`; default endpoint: `http://127.0.0.1:11434`. The model is not automatically installed. Hardware fit and generation quality require testing. Large notebooks use deterministic lexical passage selection in English and Dutch, with a 24,000-character serialized passage budget for Ollama. Cloud requests use a 90,000-character serialized passage budget. There is no fixed 240,000-character source cap.

## Source context and evidence

Chat, coverage, and chapter planning select source passages by lexical overlap in English and Dutch, preserving exact offsets into the original source text. Their disclosures show which material was supplied, which sources were consulted, and when only a selected subset fit the request. Pending audio without a readable transcript is excluded. The selector does not provide semantic search, synonym expansion or a quality guarantee.

Coverage is assessed in batches of up to 12 objectives. A missing result from a selected subset is labelled as not established because other source passages may still contain evidence. Proposed quotes are accepted only when they match the supplied source ranges exactly.

Transcript corrections retain the original text and segment time, while clearing word alignment when edited text no longer matches the machine transcript. Stale edits are rejected so a correction cannot overwrite a newer transcript. Backup and restore retains corrected transcript state.

## Google Cloud speech and AI Pro credits

1. Visit [My Benefits](https://me.developers.google.com/benefits) using the Google account with AI Pro. Claim the included Cloud credit and apply it to a billing account.
2. Select/create a Google Cloud project linked to that account and enable the Cloud Text-to-Speech API.
3. Install Google Cloud CLI and run:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

4. Ensure the authenticated account has `aiplatform.endpoints.predict` (for example through Vertex AI User), and permission to consume services on the quota project.
5. Save your project ID in Connections & settings → Google speech. The guided setup also offers an authentication-only check, which does not generate speech or verify billing. `GOOGLE_CLOUD_PROJECT` in `.env` remains available as a fallback.
6. Generate a short preview and verify actual usage and credit application in Cloud Billing before generating hours of audio.

Authentication uses Application Default Credentials on the server. No Google API key or token is exposed to the browser. Merely configuring a project does not verify credentials or credit eligibility.

Speech cost estimates use published rates as of 2026-09-08: Gemini 2.5 Flash TTS at $0.90/hour audio output; Gemini 3.1 Flash TTS Preview and 2.5 Pro TTS at $1.80/hour. Text input, retries, taxes and research/script generation are additional. Credits are not read or enforced by the app. Estimates are not a billing cap.

Audio is chunked under UTF-8 request limits, cached, and assembled as PCM WAV. Preview segments are reused by full generation. Completed chapters survive cancellation and restart. Cache writes use temporary files and script/voice fingerprints; corrupt segments are regenerated on retry. Editing is locked once a chapter has speech cached, to prevent stale audio; create a new episode for further script variations.

Full-episode WAV downloads stream from disk without loading the entire episode into memory. MP3 export is offered when `ffmpeg` is installed on PATH (or specified with `FFMPEG_PATH`). Chapter downloads are also available. The player remembers chapter positions, provides speed and seek controls, and advances through available audio. Downloads are the first iPhone listening path; phone synchronization is still on the roadmap.

## Local recordings and transcription

Audio sources stay on this computer. SenniBook can play the original recording, create a timestamped local transcript, and let you jump from each transcript segment back to its audio time. Original media and transcript metadata are included in portable notebook backups.

OCR keeps the original document or image, caches work per page, and supports cancellation and retry. It is intended for printed text; it does not claim to understand diagrams or provide reliable handwriting transcription.

Local transcription requires Python. The guided setup creates a managed isolated Windows virtual environment and downloads one of the supported faster-whisper models: `large-v3` for detailed transcription or `large-v3-turbo` for faster transcription. Each recording can use automatic language detection, English, or Dutch. CPU and NVIDIA CUDA transcription have passed integration checks with an 18-second synthetic English clip, each producing four segments and 38 word timestamps; these checks are not quality benchmarks. The CUDA run used an RTX3060 with `device=cuda` and `float16`. Dutch quality validation remains pending.

GPU use is opt-in. On Windows, the setup installs the additional CUDA/cuBLAS/cuDNN libraries into the managed virtual environment for an NVIDIA GPU; this path has been verified on an RTX3060. Python, the selected model and the optional GPU runtime are kept separate from the main Node installation.

Script checks flag duration mismatch, severely unbalanced speakers, repeated stock phrases and structural source-link gaps. They are advisory checks, not semantic fact checking or a guarantee of learning-objective coverage.

References: [Google speech setup](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts), [speech pricing](https://cloud.google.com/text-to-speech/pricing), [credit redemption](https://developers.google.com/profile/help/benefits).

## Data and exports

Notebook state lives in `data/sennibook.sqlite`; generated audio lives in `data/audio/`; immutable uploaded source and recording bytes live in `data/originals/`. All are ignored by Git. The portable ZIP v2 notebook backup includes the notebook manifest, episode snapshots, generated audio/cache files and referenced originals without loading long audio into memory. Restore writes a new notebook with remapped IDs and does not overwrite an existing library. Legacy ZIP v1 backups remain importable; older backups may contain extracted text without the original binary.

Markdown exports include current sources and objectives plus each episode's saved source/goal snapshots, teaching instructions and transcripts. Uploaded sources include original-byte and extracted-text SHA-256 hashes. Markdown is a readable export for Obsidian, not a complete audio backup.

## Scope of this edition

Implemented: persistent notebooks, source and audio import, original media retention, printed-page OCR for PDF/PNG/JPEG, timestamped local transcription, objective extraction, quoted coverage, source-grounded chat, editable subject harnesses, chapter planning/scripts, Google two-speaker TTS, previews, cached resumable audio jobs, chapter and full audio downloads, portable ZIP v2 backup/restore and Markdown export.

Not implemented: automatic source discovery/import, live Obsidian synchronization, local TTS, quizzes, diagrams, automatic mastery assessment, collaborative accounts, cloud deployment. OCR does not claim diagram understanding or reliable handwriting quality. Long-form duration is an estimate, not a guaranteed runtime; inspect the scripted-minute count before paying for audio. Transcription quality still needs review against recordings, especially for Dutch; the CPU and CUDA checks are integration checks rather than quality benchmarks.

## Development

```powershell
npx playwright install chromium
npm test
npm run build
```

React + Vite frontend, Express/TypeScript backend, built-in Node SQLite. `shared/model.ts` contains editable default subject profiles and the base harness. `server/providers.ts` owns model and speech adapters. `server/jobs.ts` owns episode generation. Credentials belong in `.env` or your OS credential store, never in source files or `VITE_` variables.

Release 0.2.2 includes the current context, OCR and draft-preservation work. The portable executable started, recognized a printed English/Dutch scan, and retained a question draft across a full process restart in an isolated library. Prior packaged checks covered PNG recognition, scanned and selectable PDF imports/recognition, saved recording readers, and an OCR/original ZIP backup round-trip. A real packaged OpenCode chat returned verified quotations; live coverage, planning and script checks also passed against the current adapters. A complete provider-to-speech run still needs Google Cloud setup; actual course-pack and long-form listening evaluations remain pending.

Unsent questions, pasted sources, goal lists and chapter edits are retained in this device's browser storage. They are unfinished drafts, separate from saved notebook content and ZIP backups. Storage failures show a warning while retaining the current input. If another browser tab saves a different draft, copy any local text you want to keep before reopening that view. This is draft recovery, not collaborative editing or cross-device synchronization.

The owner has requested that further automated test writing wait until the explicit project wrap-up. During development, use build checks and manual workflow checks, and retain the existing suites for the final sweep. Active milestones and continuation notes live in ROADMAP.md and WORKLOG.md.
