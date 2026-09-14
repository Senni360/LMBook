"use strict";

const { parentPort } = require("node:worker_threads");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { createWorker } = require("tesseract.js");

const ENGINE = "tesseract.js";
const VERSION = "7.0.0";
const MODEL_REPOSITORY = "tesseract-ocr/tessdata_fast";
const MAX_PAGES = 600;
const MAX_OUTPUT_CHARS = 1_000_000;
const MAX_PAGE_TEXT_CHARS = 1_000_000;
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_ORIGINAL_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_EDGE = 12_000;
const MAX_IMAGE_PIXELS = 12_000_000;
const RENDER_VERSION = "pdf-300dpi-cap12mp-image-resize-v2";
const SUPPORTED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

function fail(message) {
  throw new Error(message);
}

function postProgress(message) {
  parentPort.postMessage({ type: "progress", message });
}

class UtilityCanvasFactory {
  create(width, height) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1
    )
      fail("Invalid PDF canvas dimensions.");
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(canvasAndContext, width, height) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1
    )
      fail("Invalid PDF canvas dimensions.");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.context = null;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readBounded(filePath, maxBytes) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > maxBytes)
    fail(`OCR file exceeds the ${maxBytes} byte limit.`);
  return fs.readFile(filePath);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parsePngDimensions(buffer) {
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
    return null;
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      continue;
    if (offset + 1 >= buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && length >= 7)
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    offset += length;
  }
  return null;
}

function validateDimensions(
  dimensions,
  maxPixels = MAX_IMAGE_PIXELS,
  maxEdge = MAX_IMAGE_EDGE,
) {
  if (
    !dimensions ||
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > maxEdge ||
    dimensions.height > maxEdge ||
    dimensions.width * dimensions.height > maxPixels
  )
    fail(`Image dimensions exceed the ${maxPixels} pixel OCR limit.`);
}

function imageDimensions(buffer, mediaType) {
  const dimensions =
    mediaType === "image/png"
      ? parsePngDimensions(buffer)
      : parseJpegDimensions(buffer);
  return dimensions;
}

async function prepareImage(buffer, mediaType) {
  const dimensions = imageDimensions(buffer, mediaType);
  validateDimensions(dimensions, MAX_ORIGINAL_IMAGE_PIXELS, MAX_IMAGE_EDGE);
  if (dimensions.width * dimensions.height <= MAX_IMAGE_PIXELS)
    return { buffer, mediaType, dimensions };

  const scale = Math.sqrt(
    MAX_IMAGE_PIXELS / (dimensions.width * dimensions.height),
  );
  const width = Math.max(1, Math.floor(dimensions.width * scale));
  const height = Math.max(1, Math.floor(dimensions.height * scale));
  validateDimensions({ width, height });
  const image = await loadImage(buffer);
  const canvas = createCanvas(width, height);
  try {
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return {
      buffer: canvas.toBuffer("image/png"),
      mediaType: "image/png",
      dimensions: { width, height },
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function normalizePage(page) {
  if (!isPlainObject(page)) fail("Invalid cached OCR page.");
  if (
    !Number.isInteger(page.number) ||
    page.number < 1 ||
    page.number > MAX_PAGES ||
    typeof page.text !== "string" ||
    page.text.length > MAX_PAGE_TEXT_CHARS ||
    !["text-layer", "ocr"].includes(page.method)
  )
    fail("Invalid cached OCR page fields.");
  const result = {
    number: page.number,
    text: page.text,
    method: page.method,
  };
  if (page.confidence !== undefined) {
    if (
      !Number.isFinite(page.confidence) ||
      page.confidence < 0 ||
      page.confidence > 100
    )
      fail("Invalid cached OCR confidence.");
    result.confidence = page.confidence;
  }
  for (const field of ["width", "height"]) {
    if (page[field] !== undefined) {
      if (
        !Number.isInteger(page[field]) ||
        page[field] < 1 ||
        page[field] > 100_000
      )
        fail("Invalid cached OCR dimensions.");
      result[field] = page[field];
    }
  }
  return result;
}

async function readManifest(assetsDir) {
  const raw = await readBounded(
    path.join(assetsDir, "manifest.json"),
    64 * 1024,
  );
  let manifest;
  try {
    manifest = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("OCR asset manifest is not valid JSON.");
  }
  if (
    !isPlainObject(manifest) ||
    manifest.engine !== ENGINE ||
    manifest.engineVersion !== VERSION ||
    manifest.modelRepository !== MODEL_REPOSITORY ||
    typeof manifest.modelRevision !== "string" ||
    !/^[0-9a-f]{40}$/u.test(manifest.modelRevision) ||
    !isPlainObject(manifest.files)
  )
    fail("OCR asset manifest is invalid.");
  for (const language of ["eng", "nld"]) {
    const entry = manifest.files[language];
    if (
      !isPlainObject(entry) ||
      typeof entry.file !== "string" ||
      !/^[a-z]{3}\.traineddata\.gz$/u.test(entry.file) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      !/^[A-Fa-f0-9]{64}$/u.test(entry.sha256)
    )
      fail(`OCR ${language} asset manifest entry is invalid.`);
    const filePath = path.join(assetsDir, entry.file);
    if (entry.bytes > MAX_INPUT_BYTES)
      fail(`OCR ${language} asset is too large.`);
    const asset = await readBounded(filePath, entry.bytes);
    if (
      asset.length !== entry.bytes ||
      sha256(asset) !== entry.sha256.toLowerCase()
    )
      fail(`OCR ${language} asset failed its manifest checksum.`);
  }
  return manifest;
}

function cacheKey(sha, options, manifest) {
  const assetHashes = options.language
    .split("+")
    .map((language) => manifest.files[language].sha256.toLowerCase())
    .join("-");
  const identity = `${sha}-${ENGINE}-${VERSION}-${manifest.modelRevision}-${assetHashes}-${options.language}-${options.mode}-${RENDER_VERSION}`;
  return crypto.createHash("sha256").update(identity).digest("hex");
}

async function readCachedPage(cacheRoot, key, number) {
  const filePath = path.join(
    cacheRoot,
    key,
    `page-${String(number).padStart(4, "0")}.json`,
  );
  try {
    const raw = await readBounded(filePath, MAX_PAGE_TEXT_CHARS + 20_000);
    if (raw.length > MAX_PAGE_TEXT_CHARS + 20_000) return null;
    const record = JSON.parse(raw.toString("utf8"));
    if (!isPlainObject(record) || record.key !== key) return null;
    const page = normalizePage(record.page);
    return page.number === number ? page : null;
  } catch {
    return null;
  }
}

async function writeCachedPage(cacheRoot, key, page) {
  const directory = path.join(cacheRoot, key);
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(
    directory,
    `page-${String(page.number).padStart(4, "0")}.json`,
  );
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const data = JSON.stringify({ key, page });
  await fs.writeFile(temporary, data, "utf8");
  await fs.rename(temporary, filePath);
}

function pageText(content) {
  return content.items
    .map((item) =>
      "str" in item
        ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
        : "",
    )
    .join("")
    .trim();
}

function renderDimensions(viewport) {
  if (
    !viewport ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    fail("PDF page has invalid dimensions.");
  const targetScale = 300 / 72;
  const scale = Math.min(
    targetScale,
    Math.sqrt(MAX_IMAGE_PIXELS / (viewport.width * viewport.height)),
    MAX_IMAGE_EDGE / viewport.width,
    MAX_IMAGE_EDGE / viewport.height,
  );
  if (!Number.isFinite(scale) || scale <= 0) fail("PDF page is too large.");
  const width = Math.max(1, Math.floor(viewport.width * scale));
  const height = Math.max(1, Math.floor(viewport.height * scale));
  validateDimensions({ width, height });
  return { scale, width, height };
}

async function recognizeImage(
  worker,
  buffer,
  mediaType,
  number,
  cacheRoot,
  key,
  total,
) {
  const dimensions = imageDimensions(buffer, mediaType);
  const cached = await readCachedPage(cacheRoot, key, number);
  if (cached) {
    postProgress(`Using cached OCR page ${number} of ${total}.`);
    return cached;
  }
  postProgress(`OCR page ${number} of ${total}.`);
  const result = await worker.recognize(buffer, {}, { text: true });
  const confidence = Number(result.data.confidence);
  const page = normalizePage({
    number,
    text: String(result.data.text || "").trim(),
    method: "ocr",
    ...(Number.isFinite(confidence) && confidence >= 0 && confidence <= 100
      ? { confidence }
      : {}),
    width: dimensions.width,
    height: dimensions.height,
  });
  await writeCachedPage(cacheRoot, key, page);
  return page;
}

async function recognizePdf(getWorker, buffer, options, cacheRoot, key) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  const loading = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    CanvasFactory: UtilityCanvasFactory,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await loading.promise;
  if (pdf.numPages > MAX_PAGES) {
    await loading.destroy();
    fail("PDF exceeds the 600 page OCR limit.");
  }
  const pages = [];
  let totalChars = 0;
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const cached = await readCachedPage(cacheRoot, key, number);
      if (cached) {
        postProgress(`Using cached OCR page ${number} of ${pdf.numPages}.`);
        pages.push(cached);
        totalChars += cached.text.length;
        if (totalChars > MAX_OUTPUT_CHARS)
          fail("OCR output exceeds one million characters.");
        continue;
      }
      const pageProxy = await pdf.getPage(number);
      try {
        const content = await pageProxy.getTextContent();
        const extracted = pageText(content);
        if (options.mode === "missing" && extracted.length >= 20) {
          const page = normalizePage({
            number,
            text: extracted,
            method: "text-layer",
          });
          await writeCachedPage(cacheRoot, key, page);
          pages.push(page);
          totalChars += page.text.length;
          postProgress(
            `Using PDF text layer for page ${number} of ${pdf.numPages}.`,
          );
          if (totalChars > MAX_OUTPUT_CHARS)
            fail("OCR output exceeds one million characters.");
          continue;
        }
        const baseViewport = pageProxy.getViewport({ scale: 1 });
        const { scale, width, height } = renderDimensions(baseViewport);
        const viewport = pageProxy.getViewport({ scale });
        const canvas = createCanvas(width, height);
        try {
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          await pageProxy.render({
            canvasContext: context,
            canvas,
            viewport,
            background: "white",
          }).promise;
          const image = canvas.toBuffer("image/png");
          const page = await recognizeImage(
            await getWorker(),
            image,
            "image/png",
            number,
            cacheRoot,
            key,
            pdf.numPages,
          );
          pages.push({ ...page, width, height });
          totalChars += page.text.length;
          if (totalChars > MAX_OUTPUT_CHARS)
            fail("OCR output exceeds one million characters.");
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        pageProxy.cleanup();
      }
    }
  } finally {
    await loading.destroy();
  }
  return pages;
}

async function recognizeDocument(request) {
  if (!isPlainObject(request)) fail("Invalid OCR request.");
  const {
    filename,
    mediaType,
    sha256: expectedSha,
    options,
    cacheDir,
  } = request;
  if (typeof filename !== "string" || !filename || !path.isAbsolute(filename))
    fail("OCR requires an absolute original file path.");
  if (!SUPPORTED_MEDIA_TYPES.has(mediaType))
    fail("Unsupported OCR media type.");
  if (!/^[a-f0-9]{64}$/u.test(expectedSha)) fail("Invalid OCR source hash.");
  if (
    !isPlainObject(options) ||
    !["eng", "nld", "eng+nld"].includes(options.language) ||
    !["missing", "all"].includes(options.mode)
  )
    fail("Invalid OCR options.");
  if (typeof cacheDir !== "string" || !path.isAbsolute(cacheDir))
    fail("Invalid OCR cache directory.");
  const assetsDir =
    process.env.SENNIBOOK_OCR_ASSETS || path.resolve("resources/ocr");
  const manifest = await readManifest(assetsDir);
  const buffer = await readBounded(filename, MAX_INPUT_BYTES);
  if (sha256(buffer) !== expectedSha)
    fail("OCR source hash does not match the original file.");
  const key = cacheKey(expectedSha, options, manifest);
  const cacheRoot = path.resolve(cacheDir);
  await fs.mkdir(cacheRoot, { recursive: true });
  let worker;
  const getWorker = async () => {
    if (worker) return worker;
    worker = await createWorker(options.language, 1, {
      langPath: assetsDir,
      cacheMethod: "none",
      gzip: true,
      logger: ({ status, progress }) => {
        if (status && Number.isFinite(progress))
          postProgress(`${status} (${Math.round(progress * 100)}%).`);
      },
    });
    return worker;
  };
  try {
    const pages =
      mediaType === "application/pdf"
        ? await recognizePdf(getWorker, buffer, options, cacheRoot, key)
        : await (async () => {
            const prepared = await prepareImage(buffer, mediaType);
            return [
              await recognizeImage(
                await getWorker(),
                prepared.buffer,
                prepared.mediaType,
                1,
                cacheRoot,
                key,
                1,
              ),
            ];
          })();
    const result = {
      engine: ENGINE,
      version: VERSION,
      modelRevision: `${MODEL_REPOSITORY}@${manifest.modelRevision}`,
      language: options.language,
      createdAt: new Date().toISOString(),
      pages,
    };
    return result;
  } finally {
    if (worker) await worker.terminate();
  }
}

parentPort.on("message", async (message) => {
  if (!message || message.type !== "recognize") return;
  try {
    const result = await recognizeDocument(message.request);
    parentPort.postMessage({ type: "result", result });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
