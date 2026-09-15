# LMBook on macOS

## Install

Choose **arm64** for an Apple Silicon Mac (M-series chip) or **x64** for an Intel Mac. Download the matching DMG from the release, open it, and drag LMBook into Applications. The ZIP contains the same app bundle. Quit an older instance before replacing it. The bundled Electron runtime runs the application; Node is only needed for development or external CLI installations that require it.

The first Mac packages are ad-hoc signed, not Developer ID signed or Apple-notarized. No Apple signing credentials are configured in this repository. If macOS blocks a trusted download, follow [Apple's per-app opening instructions](https://support.apple.com/en-us/102445); do not disable Gatekeeper globally. A managed Mac can disallow this exception. A friction-free signed distribution requires a Developer ID certificate and notarization credentials in a future signing setup.

## Library and window behavior

Notebooks are stored in `~/Library/Application Support/LMBook/data`. A pre-existing SenniBook profile is reused. Settings shows the actual path. To move notebooks from Windows, use notebook export/import; copying a running database is not a migration method.

The Mac app uses native window controls and an application menu with standard editing, hiding and window shortcuts. Closing a window hides it; the Dock icon reopens it. Command-Q goes through the active-job confirmation before shutdown. The Windows close/quit behavior remains unchanged.

## External tools

Install and sign into the writing CLI separately, then restart LMBook. Finder-launched apps also search `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.opencode/bin` and `~/.npm-global/bin`. Version-manager paths outside these locations can be provided through `CODEX_CLI_PATH` or `OPENCODE_CLI_PATH` in the app's `.env`, using absolute paths. Source review and authentication status retain their existing checks.

Optional local transcription uses `python3` on macOS; override with `LMBOOK_PYTHON` when needed. The guided setup creates its own virtual environment. The current faster-whisper integration uses CPU on Mac; Apple GPU/Metal transcription is not implemented, and the NVIDIA runtime option is Windows-only. Optional MP3 export uses `ffmpeg` on PATH or `FFMPEG_PATH`. Provider generation, model downloads and transcription quality are separate from package-startup verification.

## Build and verification

On a Mac: `npm ci`, then `npm run desktop:dist:mac -- --arm64 --publish never` (Apple Silicon) or `--x64` (Intel). CI uses native `macos-15` and `macos-15-intel` runners. Each architecture runs the existing application suite, builds DMG/ZIP, and launches the packaged executable for the existing sandbox, private-backend, persistence and restart check. PR builds upload downloadable artifacts without publishing a release; master publishes only after all three platforms and the combined artifact verification pass.

The implementation is checked from Windows and on native CI; [PR #8](https://github.com/Senni360/LMBook/pull/8) records the delivery checks. First-launch Gatekeeper approval, real user hardware, Mac provider logins and local transcription have not yet been evaluated. Native CI results are recorded on the PR, separately from the Windows build.

Sources: [electron-builder v26 macOS configuration](https://www.electron.build/v26/docs/mac/), [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Electron application menus](https://www.electronjs.org/docs/latest/api/menu).
