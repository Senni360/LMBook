# SenniBook

A local, open-source learning notebook for detailed two-person audio and source-based flashcards. Bring your sources, begrippen and leerdoelen; inspect the evidence; shape your practice.

## Windows desktop edition

Build the installer with `npm run desktop:dist`, or launch the desktop app from source with `npm run desktop`. Build artifacts go to `release/`: an installer, a portable executable, and `win-unpacked/SenniBook.exe`.

Download the current installer or portable executable from [GitHub Releases](https://github.com/Senni360/SenniBook/releases/latest). Merging a new version into `master` automatically builds, checks and publishes its Windows downloads. See [the release workflow](docs/releasing.md) for version bumps, required release notes and retry behavior.

The local **0.3.1** build adds editable word lists and practice in either direction: `release/0.3.1/SenniBook-0.3.1-portable.exe` or `release/0.3.1/SenniBook Setup 0.3.1.exe`. Quit an older running preview first; both use the same normal application-data library. Desktop is the primary delivery target; the browser preview uses a separate library. See [0.3.1 release notes](docs/releases/0.3.1.md).

0.2.8 adds recoverable notebook Trash in Settings → Your library. Restore keeps the original notebook; explicit permanent deletion removes its unshared files and activity history, preserving files referenced by other notebooks or episode snapshots. Downloads now use a native save dialog with progress, cancellation and readable errors. Cached library summaries avoid reparsing every notebook for the sidebar, and empty-file/partial-import handling is clearer.

It also includes the hidden native menu bar (Alt reveals it), settings sidebar back button, preparation/voice draft recovery, listening position/selection/speed, and fixes for numeric goals, short imports, background-import navigation, source integrity and malformed restores. 0.2.9 adds compact backups for large notebooks with repeated episode source snapshots, correct keyboard focus, and upload size checks before transfer. See the [no-generation reliability sweep](docs/audits/2026-09-14-no-generation.md) for evidence and remaining work.

The installed app includes its runtime and starts the learning engine automatically. It stores notebooks under `%APPDATA%/SenniBook/data` (the exact folder appears in Connections & settings). The original browser edition's `data/` folder stays untouched. Provider accounts and optional external CLIs still need to be configured separately.

The desktop interface uses a stable private app address, a sandboxed renderer and a per-launch backend token. External documentation opens in your normal browser. If generation is active when you close the window, you can keep working in the tray or cancel and quit. Completed work is saved. The app prevents automatic system sleep while generation is active; it cannot keep a powered-off computer working.

These builds are unsigned; automatic updates are not yet enabled.

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

Outline generation specifies title/summary limits and makes at most one automatic repair request if the model returns invalid JSON, an invalid outline, or omits learning goals. The repair uses the same provider and consumes its normal allowance. It keeps the original sources and goals, validates all required goal IDs again, and reports a readable error if repair fails. Provider errors and cancellation do not trigger a repair request.

AI operations are real provider calls, not simulated results. No provider call occurs merely by opening a notebook. Your uploaded material is sent to the selected provider only when requesting analysis, chat or episode generation. Speech generation sends the script to the selected Google Cloud or Cartesia provider.

## Flashcards

Open a notebook's **Flashcards** section, choose **Create a word list**, write instructions and select sources. **Select all / Deselect all** applies to available source text. GPT-5.6 Luna detects the languages and extracts each pair once, independently of the episode model setting. The complete selected text is sent on request; selections over 180,000 characters are rejected without truncation. Stop and retry are available; opening, importing, editing or practising a list makes no model call.

Generation opens **Word list**: each pair has its own editable box, with chapter/example details and saved source text. Edits save automatically after a short typing pause to the notebook's stored JSON data. Language labels can also be corrected here. Pending or failed saves keep their drafts; practice and export wait for these edits to save. **Practise** uses this same list: switch direction or switch between flashcards and typing immediately, without generating another list. Source review is separate and does not block practice.

**Vocabulary** copies supplied word/translation pairs. Exact quote checks are followed by entry-by-entry pairing review and confirmation of the requested source count. The app cannot guarantee flawless PDF extraction. For a misread or missing entry, use **Edit entry / Add missing entry**, select manual transcription, retain the faulty extracted passage or nearby heading and record the original page/row and correction. This preserves the source, marks the correction as human transcription and clears review until checked again. **Concepts** generates questions/answers with inspectable quotations; quote matching does not prove their meaning or completeness.

The existing German flashcard HTML format (`const DATA` with chapter `words` containing `de`, `nl`, `ex`) imports through **Import an existing word list** without executing its scripts. UTF-8 tab-separated text supports word, translation, optional chapter and example columns. Imports allow up to 2 MB and 2,000 pairs. Accepting an imported list as the answer key does not verify it against a separate textbook.

Practice supports both directions, chapter selection, shuffle, examples, missed/unanswered rounds, keyboard controls, optional mouse grading and standard gamepads. Typed answers preserve articles, case, accents, ß and punctuation; Unicode composition and surrounding whitespace are normalized. Only the current face is rendered, preventing an upcoming answer from appearing during transitions. Position and direction-specific outcomes persist on this device; they are not included in notebook backups. ZIP backups preserve decks, review state and saved source originals. **Export JSON** downloads the saved pairs and explicit verification status, including when review is incomplete. Editing a pair clears its source review; source excerpts are kept unchanged. Free edits do not automatically become verified transcriptions.

## Thinking providers

### Codex CLI

The Windows npm-installed CLI is detected automatically. Run `codex login` in your terminal first, then use **Check Codex connection** in Settings. An alternative CLI launcher or executable path can be set with `CODEX_CLI_PATH`. SenniBook uses the documented `codex app-server` integration with its own client identity and your existing authentication, as T3 Code does. Lesson threads are temporary and read-only, with tools and configured MCP servers disabled for that thread. Windows launches the native binary hidden to avoid empty command windows. Subscription/account limits and provider terms still apply; this integration does not promise account eligibility or unlimited use.

### OpenCode Go

OpenCode describes Go as intended for coding-agent traffic. Permission to use that subscription for lessons remains unconfirmed; successful authentication alone does not settle it. See the [Go usage guidance](https://opencode.ai/docs/go/#where-can-i-use-it).

Install OpenCode, connect your Go account, and select OpenCode Go in Settings. SenniBook can reuse that local CLI login without copying its key. The CLI defaults to `muse-spark-1.3-contributor`, disables tools for generation, and sends the complete bounded request through standard input. This avoids the CLI attachment reader truncating long source material. Set `OPENCODE_CLI_PATH` if the executable is installed outside the detected npm location.

Alternatively set `OPENCODE_API_KEY` in `.env` and enter a model ID with a `/chat/completions` endpoint from the [provider documentation](https://opencode.ai/docs/go/). This direct API mode takes precedence over CLI login. Models using `/messages` or `/responses` are only supported through the CLI adapter. No silent fallback to another paid service occurs.

### Ollama

Run a local Ollama server, install a suitable model, and select it in Settings. Default model: `qwen3:8b`; default endpoint: `http://127.0.0.1:11434`. The model is not automatically installed. Hardware fit and generation quality require testing. Large notebooks use deterministic lexical passage selection in English and Dutch, with a 24,000-character serialized passage budget for Ollama. Cloud requests use a 90,000-character serialized passage budget. There is no fixed 240,000-character source cap.

## Source context and evidence

Chat, coverage, and chapter planning select source passages by lexical overlap in English and Dutch, preserving exact offsets into the original source text. Their disclosures show which material was supplied, which sources were consulted, and when only a selected subset fit the request. Pending audio without a readable transcript is excluded. The selector does not provide semantic search, synonym expansion or a quality guarantee.

Coverage is assessed in batches of up to 12 objectives. A missing result from a selected subset is labelled as not established because other source passages may still contain evidence. Proposed quotes are accepted only when they match the supplied source ranges exactly.

Transcript corrections retain the original text and segment time, while clearing word alignment when edited text no longer matches the machine transcript. Stale edits are rejected so a correction cannot overwrite a newer transcript. Backup and restore retains corrected transcript state.

## Cartesia speech

1. Open **Connections & settings → Cartesia speech**, paste your API key, and choose **Connect Cartesia**. This checks voice-list access without generating speech. The key stays in the host data directory, outside notebook settings and exports; it is stored as a local credential file, not in browser storage. `CARTESIA_API_KEY` in `.env` is an optional fallback. Disconnecting in the app disables that fallback until you reconnect.
2. In **Audio studio → Voice settings**, choose **Cartesia · Sonic 3.6**, then select a different voice for each host. The searchable voice list follows the notebook's English/Dutch language. Delivery speed is adjustable. New plans default to **High · 44.1 kHz** audio; **Standard · 24 kHz** remains available.
3. For an existing script, open **Voices for this episode**, choose the provider, voices and audio quality, then **Save episode voices**. Saving creates a separate script copy if audio has already been generated; the original audio is preserved. Older episodes retain their 24 kHz setting until changed. To upgrade one, select **High · 44.1 kHz**, save, then preview or generate the new copy.
4. Choose **Voice preview** to hear the first segment from each host. Both previews and full episodes consume Cartesia credits. The full-script estimate is approximately one credit per character, before normalization and retries. Target-length estimates assume 145 words/minute and six characters/word; account balances and overage settings are not read or enforced.

Each host turn is synthesized separately, split under the existing UTF-8 request limit when needed. Completed segments are cached and reused, including previews. Cancellation or a provider error can be retried without regenerating valid cached segments. Existing WAV/MP3 downloads work with Cartesia episodes.

The adapter uses Cartesia API version `2026-08-14` and model `sonic-3.6`, requesting native PCM16 WAV at the selected rate. Real account access and short packaged two-host previews passed. The owner preferred 44.1 kHz in a matched comparison; this supports the default, but is not a general pronunciation or long-form quality guarantee. The 0.2.6 packaged app also produced an 8.4-second 44.1 kHz preview after upgrading an isolated legacy episode, preserving the original audio. See [comparison evidence](docs/research/cartesia-audio-quality.md). References: [speech endpoint](https://docs.cartesia.ai/api-reference/tts/bytes), [voice list](https://docs.cartesia.ai/api-reference/voices/list), [credit metering](https://docs.cartesia.ai/pricing).

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

Notebook state lives in `data/sennibook.sqlite`; generated audio lives in `data/audio/`; immutable uploaded source and recording bytes live in `data/originals/`. All are ignored by Git. Portable ZIP backups include the notebook manifest, episode snapshots, generated audio/cache files and referenced originals without loading long audio into memory. Small backups retain v2 compatibility. When repeated source snapshots exceed the 20 MiB manifest limit, v3 stores identical source sets once and preserves different historical versions. v3 requires SenniBook 0.2.9 or later to restore; v1/v2 backups remain importable. Restore creates a new notebook with remapped IDs. Limits remain 20 MiB for the compact manifest, 32 MiB per source set, 128 MiB for expanded source snapshots and 2 GiB total uncompressed content. Older backups may contain extracted text without the original binary.

Markdown exports include current sources and objectives plus each episode's saved source/goal snapshots, teaching instructions and transcripts. Uploaded sources include original-byte and extracted-text SHA-256 hashes. Markdown is a readable export for Obsidian, not a complete audio backup.

## Scope of this edition

Implemented: persistent notebooks with recoverable Trash, source and audio import, original media retention, printed-page OCR for PDF/PNG/JPEG, timestamped local transcription, objective extraction, quoted coverage, source-grounded chat, editable subject harnesses, chapter planning/scripts, Google and Cartesia two-speaker speech, previews, cached resumable audio jobs, streamed desktop downloads, portable ZIP backup/restore and Markdown export.

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

The owner's explicit release wrap-up permits focused regression tests for the completed fixes. Active milestones and continuation notes live in ROADMAP.md and WORKLOG.md.
