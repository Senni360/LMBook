# Notebook size, backup, and list performance review

Scope: read-only inspection of `server/notebook-bundle.ts`, `server/store.ts`, `server/index.ts`, `server/jobs.ts`, and `server/episode-revisions.ts`. The diagnostic is `.work/performance-review/measure.ts` (ignored local diagnostic). All measured fixtures are synthetic repeated course prose; no provider, generation, OCR, transcription, user library, or production file was used.

## Concrete limits

- Pasted source text is capped at 1,000,000 characters in `server/index.ts:554`; ordinary document uploads are capped at 20 MiB (`:571`), and audio uploads at 500 MiB (`:671`). The JSON parser is capped at 15 MB (`:134`).
- Bundle source records allow up to 20,000,000 characters each and 150 current sources (`server/notebook-bundle.ts:81`, `:185`). A notebook can contain up to 100 episodes (`:188`), each with an optional full `sources` snapshot (`:158`).
- The bundle manifest embeds the entire notebook object and rejects JSON larger than 20 MiB (`server/notebook-bundle.ts:42`, `:508-511`). Import applies the same 20 MiB limit to the uncompressed `notebook.json` entry (`:799-801`). ZIP compression does not help this check.

The independently permitted limits therefore do not compose: 21 one-million-character source records are within the source-count and per-source limits, but already exceed the manifest limit before episodes or messages are added. A file upload near 20 MiB can still be reasonable if its extracted text is small, because the original binary is a separate bundle entry; the failure is driven by serialized notebook text and metadata.

## Bundle measurements

The diagnostic uses 1,000,000-character source chunks and no original attachments or audio entries. `manifestMiB` is the uncompressed serialized notebook JSON; `archiveBytes` is the resulting ZIP size when creation succeeds.

| Synthetic fixture | Manifest | Result | Create time |
| --- | ---: | --- | ---: |
| 5 MiB source text | 5.042 MiB | succeeds; 22,350-byte ZIP because the repeated prose compresses heavily | 52–59 ms |
| 20 MiB source text | 20.165 MiB | fails before writing an archive: `Notebook manifest exceeds the 20 MB limit.` | 39–56 ms |
| 50 MiB source text | 50.410 MiB | same manifest failure | 85–111 ms |

The boundary probe found a synthetic source text of 20,800,000 characters serialized to exactly 20.000 MiB and accepted (`>` is used, so equality passes); 20,820,000 characters serialized to 20.019 MiB and failed. The practical text ceiling is therefore about 20.8 million ASCII characters for this small notebook shape, lower after objectives, coverage, chat, transcripts, or episode metadata are included.

## Repeated episode snapshots

For a synthetic 5 MiB source pack, each episode snapshot is a full `structuredClone` of the source array. `server/jobs.ts:197` takes the initial copy; `server/episode-revisions.ts:39` copies it again for revisions. Bundle results:

| Full 5 MiB source pack plus | Manifest | Result |
| --- | ---: | --- |
| 0 episode snapshots | 5.042 MiB | succeeds |
| 1 snapshot | 10.084 MiB | succeeds |
| 2 snapshots | 15.126 MiB | succeeds |
| 3 snapshots | 20.168 MiB | fails at manifest creation |
| 4 snapshots | 25.210 MiB | fails at manifest creation |

This is a concrete failure mode for a moderate course pack after a few episode revisions. The snapshot is intentionally immutable, so removing or silently replacing it would change the historical-source guarantee. Exact duplicate snapshots can be deduplicated by a canonical full-source hash while retaining distinct changed versions.

## Notebook-list measurements

`GET /api/notebooks` asks `listNotebooks()` for full notebooks and only then maps them to summaries (`server/index.ts:249`). `listNotebooks()` selects every full JSON body, parses it, normalizes settings and every episode's settings, and sorts the resulting full objects (`server/store.ts:17-31`). The diagnostic inserted synthetic 1 MiB notebook bodies into an isolated SQLite database and measured this exact function.

| Synthetic rows | Stored body bytes | Returned objects | `listNotebooks()` | RSS delta* |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 9.54 MiB | 10 full notebooks | 33–45 ms | ~21 MiB |
| 50 | 47.68 MiB | 50 full notebooks | 107–137 ms | ~95 MiB |
| 100 | 95.37 MiB | 100 full notebooks | 232–238 ms | ~191 MiB |

\*Measured in one `tsx` process with `--expose-gc`; RSS is a rough allocation signal, not a production memory profile. The rows use highly repetitive text, so SQLite file compression or OS cache behavior is not represented. The scaling is still directly attributable to parsing and retaining every full body before summary mapping. This is a summary-route cost even when the UI only needs title, subject, source count, and example.

## Incremental fixes worth considering

1. Keep the full notebook body as the source of truth, but add summary columns (title, subject, source count, example, updatedAt) to SQLite and query only those for `GET /api/notebooks`. Maintain the columns transactionally in `saveNotebook` and backfill on startup. This removes full JSON parse/normalization from the common library rail path; `getNotebook` can remain full-body for selected notebooks.
2. Preserve the 20 MiB safety bound but provide a preflight size check and a plain-language backup error with the measured manifest size and the main contributors. Then choose a larger bounded manifest only after measuring parser memory and adding staged/streamed validation. Raising the limit alone makes the current whole-JSON parse and `JSON.stringify` peak larger.
3. For bundle format v3, put immutable source snapshots in content-addressed `sources/<hash>.json` entries and let episodes reference snapshot hashes. Canonicalize the complete source object, including transcript/correction fields, so changed versions remain distinct while repeated identical snapshots are stored once. Restore can materialize the existing episode `sources` arrays for backward-compatible application code. Keep v2 import unchanged.
4. For a smaller first step, deduplicate only during bundle serialization and restore, with an explicit format version and a bounded number of snapshot records. Do not deduplicate by source ID alone: revisions can retain the same ID while the source content has changed.
