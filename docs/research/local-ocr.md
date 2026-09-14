# Local OCR for scanned PDFs and images

_Research date: 2026-09-14. Scope: local OCR for scanned PDFs and PNG/JPEG imports in the Windows Electron app, with English and Dutch support on CPU or an RTX 3060/3080. No packages were installed or downloaded during this research._

## Recommendation

Use a two-tier design:

1. **First provider: Tesseract.js 7.0.0 in the Electron/Node application, with PDF.js 6.3.289 for rasterizing PDF pages.**
2. **Optional managed provider: RapidOCR 3.9.2 with ONNX Runtime 1.30.0 in an isolated Python 3.13 CPU environment.**

Tesseract.js is the best first implementation because it is close to the application runtime: it wraps Tesseract through WebAssembly, works in Node.js and browsers, and has no Python, Torch, CUDA toolkit, or external executable requirement. Its upstream README explicitly says it does not process PDFs itself, so scanned PDFs should be rendered one page at a time through the existing pdfjs-dist dependency, then passed to the same image OCR worker. Tesseract.js and its core package publish Apache-2.0 metadata; language data should be shipped or cached with its own attribution and checksum. [Tesseract.js README](https://github.com/naptha/tesseract.js/blob/master/README.md), [Tesseract.js package metadata](https://github.com/naptha/tesseract.js/blob/master/package.json), and [PDF.js README](https://github.com/mozilla/pdf.js/blob/master/README.md) document these boundaries.

The current app already pins pdfjs-dist at **6.3.289**, which is the current stable PDF.js package shown by npm on the research date. PDF.js is Apache-2.0. Keep that version pinned with the application and use its worker build; do not add Poppler or Ghostscript merely to render pages. [pdfjs-dist 6.3.289](https://www.npmjs.com/package/pdfjs-dist/v/6.3.289), [PDF.js API](https://mozilla.github.io/pdf.js/api/).

## Why the first path fits LMBook

For a PDF:

1. Load the original bytes with PDF.js.
2. For each page, first try getTextContent(). Keep that text when it is present and coherent.
3. Render only pages with no usable text layer, or pages the user explicitly asks to OCR, to a canvas at a bounded resolution.
4. Pass the rendered PNG or an imported PNG/JPEG to one long-lived Tesseract.js worker.
5. Emit page-level text, words, confidence, and bounding boxes into the existing source extraction pipeline.
6. Release the page canvas before processing the next page.

PDF.js is designed to parse and render PDF documents and publishes a prebuilt pdfjs-dist npm package. Tesseract.js requires images rather than PDF files. This keeps PDF handling deterministic and avoids a second native document converter. [PDF.js README](https://github.com/mozilla/pdf.js/blob/master/README.md), [Tesseract.js project scope](https://github.com/naptha/tesseract.js/blob/master/README.md#project-scope).

In Electron, prefer rasterizing in the renderer or an Electron utility context with a browser canvas. A pure Node worker may need an additional native canvas implementation; that adds another Windows packaging surface and should be treated as an explicit decision. Whichever context renders the page, cap width, height, and concurrent pages, and send one image at a time to the OCR worker.

### Node-side raster probe

The installed PDF.js package already has a workable Node path. Its package metadata declares `@napi-rs/canvas` 1.0.8 as an optional dependency, and the legacy build's internal `NodeCanvasFactory` loads it automatically. No separate `canvas` package or Poppler binary is needed for the current Windows x64 target. A disposable probe on Node 24.13.1 rendered `tests/fixtures/biology.pdf` page 1 through `pdfjs-dist/legacy/build/pdf.mjs` and `@napi-rs/canvas` at scale 1.5 to a 918 by 1188 PNG (10,231 bytes). The same probe ran under Electron 44.3.0 with its Node 24.20.0 runtime and produced the same output.

This is a native Skia dependency: the Windows x64 package contains a 27.5 MB `.node` binary and a 10.8 MB ICU data file. It is MIT-licensed according to its package metadata. Keep the existing `pdfjs-dist` direct dependency and make the optional canvas dependency an explicit packaging check, because an install that omits optional dependencies will leave PDF text extraction working while page rendering fails at runtime. [pdfjs-dist package metadata](https://github.com/mozilla/pdf.js/blob/master/package.json), [@napi-rs/canvas package](https://www.npmjs.com/package/@napi-rs/canvas).

The current electron-builder configuration uses ASAR and targets Windows x64. electron-builder v26 says native `.node` files are automatically detected and unpacked from ASAR when smart unpack is enabled; keep a fallback `asarUnpack` entry for `**/node_modules/@napi-rs/canvas/**` if a packaged smoke check shows the binary missing. The current `npmRebuild: false` is acceptable for this prebuilt N-API package, but a packaged smoke probe should still load the binary through the Electron runtime. A future ARM64 target needs its matching optional canvas package and a separate raster probe. [electron-builder application contents](https://www.electron.build/v26/docs/contents/), [electron-builder native module guidance](https://www.electron.build/v26/docs/troubleshooting/).

The smallest production shape is therefore a sequential page loop in the existing Node/server process: call `getPage`, render to a bounded `@napi-rs/canvas` surface, encode PNG, pass the bytes to OCR, then destroy the page and canvas before continuing. Keep the renderer-side canvas option for a future build that wants to avoid shipping native Skia, but it is not required for the current Windows desktop package.

Render scanned pages near **300 DPI** when source dimensions allow it, while applying a maximum pixel limit to protect memory. Tesseract documentation says it works best at about 300 DPI, and calls out deskewing, borders, alpha channels, and page segmentation as meaningful accuracy factors. A practical first pass is grayscale or white-background rendering, a small border, and automatic orientation only when needed; retain the original page image for later review. [Tesseract image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

For a mixed-language notebook, expose eng, nld, and eng+nld choices. The official Tesseract data repositories identify eng as English and nld as Dutch/Flemish. The tessdata_fast repository is the reasonable default for interactive imports: it supports the LSTM engine, is explicitly a speed/accuracy compromise, and is Apache-2.0 according to the repository. Keep eng.traineddata and nld.traineddata in a versioned local model directory or download them only through an explicit OCR setup action. [Tesseract language data list](https://github.com/tesseract-ocr/tesseract/wiki/Data-Files), [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast).

Tesseract.js v7 requires Node 16 or newer; the app's Node requirement is already newer. Use createWorker("eng"), createWorker("nld"), or the combined language code once per import and terminate it after all pages. Tesseract.js says workers should be reused across multiple images. Since v6, output formats other than text are disabled by default; request blocks/word-level output explicitly when storing boxes and confidence. [Tesseract.js Node usage](https://github.com/naptha/tesseract.js/blob/master/README.md#nodejs), [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

Set local worker, core, and language paths in the packaged app. Tesseract.js documents that omitting langPath downloads language data automatically from a CDN; that default is unsuitable for a normal offline import and makes provenance harder to reproduce. Preparation should download the exact core/language assets into app data, verify their hashes, and then run OCR with local paths only. [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

## Managed Python comparison

| Option | Windows/Python 3.13 fit | Package/runtime weight | English + Dutch | Strength | Recommendation |
|---|---|---:|---|---|---|
| **Tesseract.js 7.0.0 + PDF.js 6.3.289** | Direct Electron/Node path | WASM core plus language files | eng, nld, or both | Smallest deployment and no external runtime | First provider |
| **RapidOCR 3.9.2 + ONNX Runtime 1.30.0 CPU** | Good optional isolated-worker path; RapidOCR publishes Python 3.13 metadata and ONNX Runtime publishes a cp313-win_amd64 wheel | Much lighter than Torch-based stacks, but includes Python and ONNX model files | Verify the selected PP-OCR model language list before enabling nl | Detection plus recognition boxes and confidence, with CPU backend | Best optional managed provider |
| **PaddleOCR 3.7.0** | Package publishes Python 3.13 metadata; full framework/model setup is more involved | Larger and more moving parts than RapidOCR | Official docs list Dutch as nl and broad multilingual support | Better future path for layout, tables, and document structure | Defer until layout extraction is needed |
| **EasyOCR 1.7.2** | Windows setup requires choosing and installing matching Torch/torchvision first | Torch is a substantial managed dependency; model weights auto-download | Official language list includes en and nl; CPU mode exists | Convenient scene-text API with boxes, text, confidence | Defer because Torch adds setup and cache complexity |
| **Native Tesseract 5 executable** | Windows installer exists, but adds external binary, PATH/data-directory handling, and machine setup | Small native engine plus language data | eng and nld | Mature fallback if WASM accuracy or speed is insufficient | Avoid as first Electron onboarding path |

RapidOCR's official install path is pip install rapidocr onnxruntime, and its documentation recommends the ONNX Runtime CPU engine for the standard path. On the research date, PyPI listed rapidocr 3.9.2, requiring Python 3.8 through 3.x and publishing a Python 3.13 classifier, and onnxruntime 1.30.0 with a Windows x86-64 CPython 3.13 wheel. These versions are practical pins for a managed CPU worker, subject to a real install check before release. RapidOCR's package wheel is listed at 27.3 MB; the ONNX Runtime Windows CPython 3.13 wheel is listed at about 14.3 MB before dependencies and model files. [RapidOCR PyPI metadata](https://pypi.org/project/rapidocr/), [RapidOCR installation guide](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/install/), [ONNX Runtime 1.30.0 Windows wheels](https://pypi.org/project/onnxruntime/1.30.0/), [RapidOCR repository](https://github.com/RapidAI/RapidOCR).

RapidOCR reports detection/recognition results and can use CPU ONNX Runtime without CUDA. Its official repository says bundled model files derive from PaddleOCR and directs users to model-specific license and attribution information. The worker must record exact model filenames, source, version, and checksums alongside the model cache. Do not silently allow a first OCR job to download models; make preparation explicit and use local-only mode for normal imports. [RapidOCR license/model notes](https://github.com/RapidAI/RapidOCR#models).

PaddleOCR is a credible later option when page layout, tables, or structured document parsing matters. Its official multilingual documentation lists 80 languages and nl for Dutch, while current PyPI metadata lists paddleocr 3.7.0 with Python 3.13 support. Its installation still requires the Paddle framework and model setup, so it is a larger managed runtime than the CPU ONNX path. Treat its layout features as a separate capability rather than making ordinary OCR depend on them. [PaddleOCR multilingual support](https://www.paddleocr.ai/v2.10.0/en/ppocr/blog/multi_languages.html), [PaddleOCR PyPI metadata](https://pypi.org/project/paddleocr/).

EasyOCR is useful for a future scene-text or difficult-layout experiment. Its official README lists Dutch and English, accepts image paths or bytes, returns boxes/text/confidence, and supports gpu=False. The same README specifically tells Windows users to install matching Torch and torchvision first; its language models are automatically downloaded unless manually populated. That extra runtime and model-management surface is a poor first fit for a compact import workflow. [EasyOCR README](https://github.com/JaidedAI/EasyOCR), [EasyOCR 1.7.2 metadata](https://pypi.org/project/easyocr/1.7.2/).

## OCR output and source grounding

Store OCR as page-scoped source evidence, for example:

    {
      "page": 12,
      "language": "nld",
      "engine": "tesseract.js@7.0.0",
      "model": "tessdata_fast@<pinned-revision>",
      "text": "…",
      "words": [
        { "text": "…", "confidence": 91.4, "left": 120, "top": 340, "width": 88, "height": 31 }
      ]
    }

Keep the original source ID, page number, source byte hash, render scale, language, engine/model revision, and an OCR warning when confidence is low or the page is mostly graphical. Store page text in source order and preserve the page boundary so later excerpts can cite sourceId plus page. Do not turn OCR text into authoritative facts: scanned text can contain substitutions, missing columns, or reading-order errors.

For progress and resume, cache each page separately using the original-file hash plus OCR engine/model/language/render settings. Write page results to a temporary file and atomically rename only after the JSON is complete and parses. A cancelled import should leave earlier valid pages reusable and retry the interrupted page. Model downloads and OCR jobs should have separate caches and explicit offline behavior.

Use the PDF text layer when it is good enough; OCR only the pages that need it. For PNG/JPEG, use the same worker and page-like record with page: 1. Keep rendered page images or a user-requested preview available when an excerpt needs visual verification.

## Biology diagrams and limits

OCR can recover labels, captions, and nearby explanatory text, but it does not understand a diagram's arrows, spatial relationships, chemical structures, plots, or biological morphology. Tesseract's output boxes are useful for locating text; they do not make the diagram semantically searchable. Preserve a page image reference and mark pages with little recognized text as visual-content so a later multimodal capability can inspect them. A future PaddleOCR layout provider may improve regions and tables, but it still should not be represented as visual reasoning.

For scanned pages, warn when the image is skewed, below target resolution, heavily bordered, low contrast, or dominated by graphics. Tesseract's own guidance says skew can reduce line segmentation quality and that page segmentation mode matters for sparse or non-standard layouts. [Tesseract quality and segmentation guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

## Packaging and setup boundaries

- Bundle Tesseract.js code and the chosen PDF.js build with the Electron application.
- Keep eng and nld language data in a managed app-data cache with pinned checksums. The first setup can download them after an explicit user action; import should fail clearly when selected language data is absent.
- Keep RapidOCR in a separate managed Python 3.13 venv under app data. Install exact wheels during an explicit preparation action, download exact model files into a temporary directory, verify them, then atomically activate the cache.
- Run the OCR worker out of process with JSONL progress/results, bounded diagnostics, and cancellation that terminates descendants. Normal OCR must not reach the network.
- Show active engine, language, page progress, and warnings. Permit CPU fallback; do not require an NVIDIA GPU for OCR.
- Record license/attribution metadata for Tesseract.js, PDF.js, Tesseract language data, RapidOCR, ONNX Runtime, and each model. This is a packaging record, not a legal conclusion; review upstream notices before shipping.

## Verified references

- [Tesseract.js v7 release](https://github.com/naptha/tesseract.js/releases)
- [Tesseract.js package license and core dependency](https://github.com/naptha/tesseract.js/blob/master/package.json)
- [Tesseract.js local language/core paths](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [Tesseract official Windows installation notes](https://github.com/tesseract-ocr/tessdoc/blob/main/Installation.md#windows)
- [Tesseract tessdata_fast models and Apache-2.0 license](https://github.com/tesseract-ocr/tessdata_fast)
- [Mozilla PDF.js / pdfjs-dist](https://github.com/mozilla/pdf.js)
- [RapidOCR CPU/ONNX Runtime installation](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/install/)
- [RapidOCR model licensing notes](https://github.com/RapidAI/RapidOCR#models)
- [PaddleOCR language list](https://www.paddleocr.ai/v2.10.0/en/ppocr/blog/multi_languages.html)
- [EasyOCR Windows and CPU guidance](https://github.com/JaidedAI/EasyOCR)
