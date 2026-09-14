# LMBook naming and upgrade compatibility

The owner selected LMBook on 14 September 2026. Version 0.3.3 changes the application name, Windows executable and installer names, menus, tray, download filenames, media attribution, provider client identity and current project documentation. The existing open-book icon remains suitable for the new name.

## Existing data

LMBook reuses `%APPDATA%/SenniBook` when that profile already exists. This keeps its SQLite library, uploaded originals, generated audio, provider configuration, Chromium storage, drafts and playback positions together without moving or copying live files. A new installation without that profile uses `%APPDATA%/LMBook`. Connections & settings shows the actual data folder.

`LMBOOK_USER_DATA` overrides either default for an isolated profile. The former `SENNIBOOK_USER_DATA` override remains supported. `LMBOOK_PYTHON` is the preferred optional interpreter setting; `SENNIBOOK_PYTHON` remains a fallback.

Keep these compatibility identifiers stable unless a separately verified migration is implemented:

- `org.sennibook.desktop`: Windows installer identity, so an existing installation can be upgraded.
- `sennibook://app`, browser storage keys and `sennibookDesktop`: private desktop origin, saved preferences/drafts and the internal preload bridge.
- `sennibook.sqlite` and `sennibook-notebook` / `sennibook-flashcards`: database filename and backup/export format identifiers. LMBook opens existing backups; compatible older versions can still read newly exported data.
- Internal desktop authentication headers and worker environment variables: matched client/server contracts, unrelated to the displayed brand.

Prior release notes and work-log entries retain their historical names and artifact paths. The workspace folder itself can retain its existing path; it does not determine the application name. This rebrand does not change the content of the owner's saved study material or previously generated files.
