# LMBook OCR assets

These language assets are compressed copies of the official `tessdata_fast`
English (`eng`) and Dutch/Flemish (`nld`) traineddata files at the revision in
`manifest.json`. The manifest records the exact source revision, byte count, and
SHA-256 for each file. The application verifies those values before starting
Tesseract.js and uses the local files with network access disabled by design.

The traineddata repository is distributed under Apache License 2.0; the full
text is in `LICENSE.tessdata_fast`. The OCR runtime is the npm package
`tesseract.js` 7.0.0, also Apache-2.0, and its bundled `tesseract.js-core`
7.0.0 package supplies the WASM engine. Keep the npm package notices with the
application distribution.
