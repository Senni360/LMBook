# AI setup and vault search delivery

2026-09-16, working preview 0.3.11. This does not publish or approve 0.4.

## What is available

- Fresh-library onboarding checks the Codex CLI, a ChatGPT subscription account and Luna availability. Browser sign-in, cancellation, retry and a small optional readiness request are provided. Completing onboarding is durable; existing libraries are not locked out. The owner clarified Codex/OpenAI instead of Claude Code.
- Luna remains on Codex App Server. New hosted chat and the hosted embedding option use OpenRouter. Settings support connect, validate-before-replace, check, disconnect, model discovery and model pricing from the catalogue. A notebook can select OpenRouter as its text provider. Credits are separate from the ChatGPT subscription.
- Local settings show detected RAM, CPU and NVIDIA memory when available, explain feasibility limits, and offer an optional Luna explanation using only hardware fields. Total VRAM is not treated as proof that GPU transcription will run.
- multilingual-e5-small has an explicit install, cancel, enable and disable flow. It uses a separate Python environment, a pinned checkpoint, an offline smoke check before reporting ready, bounded CPU batches, UTF-8 transport and idle unloading. Existing transcription controls and built-in OCR are grouped alongside it.
- The vault quick switcher retains name/alias search and adds explicit meaning search. Each vault chooses names only, local E5 or OpenRouter embeddings. Indexing shows progress and cancellation. Cloud indexing requires a visible consent checkbox; queries run on an explicit search action. Original Markdown is not rewritten by indexing.
- Index updates replace a note's vectors atomically after its entire text succeeds. Failed batches and cancellation preserve previous entries; changed notes do not show stale passages. Model identity changes require matching embeddings. Partial scans do not erase an existing index.

## Observed checks

The real Codex connection check passed on this computer. Luna answered a small readiness request in approximately 3.9 seconds and a hardware explanation in approximately 9.7 seconds. No notes were sent. A fresh local runtime and checkpoint download completed, including offline smoke validation, and embeddings worked after worker unload/restart.

The integrated local pipeline read all **291 Markdown notes** from `D:\Downloads\PWS\vault` using an isolated evaluation database. It indexed **1,494 passages in 209.52 seconds**, then returned ten results for one authored query in **60.21 ms**. Every source hash remained unchanged. This used the CPU on an i7-10700F / 32 GiB / RTX 3060 12 GiB computer, leaving GPU memory free. It is an observed run, not a worst-case performance guarantee or a scored retrieval-quality evaluation. The run exposed a Windows character-encoding failure; forcing UTF-8 for the persistent Python protocol fixed it, and the complete run succeeded afterward.

An isolated fault exercise with authored vectors checked long-note coverage, second-batch failure, atomic retry, invalid vectors, cancellation, stale citations, cloud consent and deleted-note cleanup. A separate authored-response OpenRouter exercise checked authentication failures, preserving an old key on invalid replacement, response ordering, malformed vectors, Luna routing rejection, chat mapping, cancellation and disconnect. These are manual integration diagnostics, not live provider or educational evaluations. No new automated test files were added.

Desktop and mobile browser screenshots of onboarding and local-model settings were inspected visually; 390-pixel layouts had no horizontal overflow. Codex check and onboarding completion were exercised through the UI in a disposable library. The native desktop smoke covers startup, sandbox/private-backend access, notebook persistence and restart. Existing smoke/integration fixtures now represent an already-onboarded library, avoiding a CI account dependency.

## Remaining limits

- No OpenRouter key was supplied, so live authentication, paid inference, actual billing and a user's selected catalogue model remain unverified. Settings expose these connection checks. There is no silent fallback to a paid Luna endpoint.
- Python must be installed for local E5 preparation. Initial preparation downloads dependencies and checkpoint files; inference thereafter is offline. GPU transcription still needs a working CUDA installation and free memory. The measured E5 workload does not establish that every proposed local model can run together or that arbitrary vault sizes fit.
- The earlier ten background-agent ideas and their three edit-control modes remain pending. This delivery provides provider setup and a usable search integration, not automatic notebook/course/learning management.
- Search relevance, exact vocabulary extraction, educational effectiveness, popular Obsidian plugin compatibility and native Mac runtime behavior are separate evaluations.
- Jev is excluded because the owner has no API access. Other unused candidates and reasons are in [the model report](background-assistant-model-usage.md).

Local evidence is under the ignored `.work/ai-ui-evaluation-20260916` and `.work/ai-fresh-install-20260916` directories next to this worktree. No owner notebook data or vault files were modified by those evaluations.

## Desktop handoff

`npm run build:desktop` passed, as did all 39 existing application/desktop checks. The portable Windows preview is `release/ai-preview/LMBook-0.3.11-portable.exe`; its unpacked executable also passed the existing desktop smoke separately. Native Electron onboarding was captured and inspected, including the disabled continue action before connection verification. The final meaning-search layout was inspected at desktop and 390-pixel widths after correcting cramped spacing, native-looking action buttons and unreadable excerpt treatment. A browser check confirmed that cloud indexing remains disabled without consent and that the server independently rejects an unconsented request. No cloud inference was involved.

Codex login callbacks now carry session identity so stale completion, timeout or cancellation cannot mutate a newer login; cleanup removes event listeners. The contributor also verified with a fake CLI that requests after process shutdown reject promptly. OpenRouter key replacement similarly preserves newer connection choices if an older authentication request returns late.

The build retains the existing Vite large-chunk advisory. The mechanical Impeccable scan reported no findings; this is not a substitute for the visual checks or owner preference. No GitHub release, commit or push was performed for this handoff.
