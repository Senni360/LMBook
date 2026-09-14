import { DOMParser } from "@xmldom/xmldom";
import { createCanvas } from "@napi-rs/canvas";
import mammoth from "mammoth";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import path from "node:path";

GlobalWorkerOptions.workerSrc = import.meta
  .resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

class UtilityCanvasFactory {
  create(width: number, height: number) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1
    )
      throw new Error("Invalid PDF canvas dimensions.");
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(
    canvasAndContext: {
      canvas: { width: number; height: number };
      context: unknown;
    },
    width: number,
    height: number,
  ) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1
    )
      throw new Error("Invalid PDF canvas dimensions.");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: {
    canvas: { width: number; height: number };
    context: unknown;
  }) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.context = null;
  }
}

const MAX_TEXT_LENGTH = 1_000_000;
const MAX_PDF_PAGES = 600;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_ZIP_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_XML_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_HTML_DEPTH = 512;
const MAX_WARNING_IDS = 8;
const DRAWINGML_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://purl.oclc.org/ooxml/drawingml/main",
]);

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

export type DocumentExtraction = {
  text: string;
  extraction: string;
  warnings: string[];
  ocrCandidate?: boolean;
};

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error("Document import cancelled.");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal);
}

function enforceTextLimit(
  text: string,
  signal?: AbortSignal,
  allowEmpty = false,
): string {
  throwIfAborted(signal);
  if (text.length > MAX_TEXT_LENGTH)
    throw new Error(
      "The extracted text exceeds one million characters. Split the file.",
    );
  const readable = text.replace(/\[(?:Page|Slide) \d+\]/gu, "").trim();
  if (!allowEmpty && !readable.length)
    throw new Error(
      "This file contains no readable text. Choose another file or paste the source text instead.",
    );
  return text;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function validateImageDimensions(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 12_000 ||
    height > 12_000 ||
    width * height > 40_000_000
  )
    throw new Error(
      "The image dimensions exceed the 12,000 px or 40 megapixel limit.",
    );
}

function validatePng(buffer: Buffer) {
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error("The PNG image header is invalid.");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  validateImageDimensions(width, height);
}

function validateJpeg(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
    throw new Error("The JPEG image header is invalid.");
  let offset = 2;
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length)
      throw new Error("The JPEG image header is truncated.");
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length)
      throw new Error("The JPEG image segment is invalid.");
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (length < 7)
        throw new Error("The JPEG image frame header is invalid.");
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      validateImageDimensions(width, height);
      return;
    }
    offset += length;
  }
  throw new Error("The JPEG image contains no readable frame header.");
}

function validateImage(buffer: Buffer, extension: string) {
  if (extension === ".png") validatePng(buffer);
  else validateJpeg(buffer);
}

function summarizeNumberWarning(
  label: string,
  numbers: number[],
  detail: string,
): string[] {
  if (!numbers.length) return [];
  const shown = numbers.slice(0, MAX_WARNING_IDS).join(", ");
  const remaining = numbers.length - Math.min(numbers.length, MAX_WARNING_IDS);
  const suffix = remaining > 0 ? ` and ${remaining} more` : "";
  return [`${label} ${shown}${suffix} ${detail}.`];
}

function archivePathSafe(filename: string): boolean {
  const pathWithoutDirectorySlash = filename.endsWith("/")
    ? filename.slice(0, -1)
    : filename;
  if (
    !pathWithoutDirectorySlash ||
    pathWithoutDirectorySlash.includes("\0") ||
    pathWithoutDirectorySlash.includes("\\") ||
    pathWithoutDirectorySlash.startsWith("/") ||
    /^[A-Za-z]:/u.test(pathWithoutDirectorySlash)
  )
    return false;
  return pathWithoutDirectorySlash
    .split("/")
    .every((part) => part && part !== "." && part !== "..");
}

function rejectUnsafeZipEntry(entry: Entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if ((unixMode & 0xf000) === 0xa000)
    throw new Error(`ZIP symlink entry is not allowed: ${entry.fileName}`);
  if (!archivePathSafe(entry.fileName))
    throw new Error(`ZIP path is unsafe: ${entry.fileName}`);
  if (entry.generalPurposeBitFlag & 1)
    throw new Error(`Encrypted ZIP entry is not allowed: ${entry.fileName}`);
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
    throw new Error(`Unsupported ZIP compression method: ${entry.fileName}`);
  if (
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES
  )
    throw new Error(
      `ZIP entry exceeds the expanded-size limit: ${entry.fileName}`,
    );
}

function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          reject(error || new Error("Could not open document ZIP."));
        else resolve(zip);
      },
    );
  });
}

async function validateZipBudget(buffer: Buffer, signal?: AbortSignal) {
  const zip = await openZip(buffer);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let totalBytes = 0;
      let count = 0;
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      zip.once("error", fail);
      zip.on("end", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on("entry", (entry: Entry) => {
        if (settled) return;
        try {
          throwIfAborted(signal);
          rejectUnsafeZipEntry(entry);
          count += 1;
          totalBytes += entry.uncompressedSize;
          if (count > MAX_ZIP_ENTRIES || totalBytes > MAX_ZIP_EXPANDED_BYTES)
            throw new Error(
              "Document ZIP exceeds the expanded size or entry count limit.",
            );
          zip.readEntry();
        } catch (error) {
          fail(error as Error);
        }
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

function readZipEntry(
  zip: ZipFile,
  entry: Entry,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(
          error || new Error(`Could not read ZIP entry ${entry.fileName}.`),
        );
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        try {
          throwIfAborted(signal);
          size += chunk.length;
          if (size > maxBytes)
            throw new Error(`ZIP XML entry is too large: ${entry.fileName}`);
          chunks.push(chunk);
        } catch (reason) {
          stream.destroy(reason as Error);
        }
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function readPptxXml(
  buffer: Buffer,
  signal?: AbortSignal,
): Promise<Map<string, Buffer>> {
  await validateZipBudget(buffer, signal);
  const zip = await openZip(buffer);
  const xml = new Map<string, Buffer>();
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      zip.once("error", fail);
      zip.on("end", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on("entry", (entry: Entry) => {
        if (settled) return;
        try {
          throwIfAborted(signal);
          const wanted =
            /^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/u.test(
              entry.fileName,
            );
          if (!wanted) {
            zip.readEntry();
            return;
          }
          void readZipEntry(zip, entry, MAX_XML_ENTRY_BYTES, signal).then(
            (value) => {
              xml.set(entry.fileName, value);
              if (!settled) zip.readEntry();
            },
            (error) => fail(error as Error),
          );
        } catch (error) {
          fail(error as Error);
        }
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return xml;
}

function parseXml(xml: Buffer, filename: string): Document {
  const value = xml.toString("utf8");
  if (/<!(?:DOCTYPE|ENTITY)\b/iu.test(value))
    throw new Error(`External XML entities are not allowed: ${filename}`);
  const document = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message: string) => {
        throw new Error(`Invalid XML in ${filename}: ${message}`);
      },
      fatalError: (message: string) => {
        throw new Error(`Invalid XML in ${filename}: ${message}`);
      },
    },
  }).parseFromString(value, "application/xml");
  if (
    !document.documentElement ||
    document.documentElement.nodeName === "parsererror"
  )
    throw new Error(`Invalid XML in ${filename}.`);
  return document;
}

function xmlAttributeByLocalName(node: Element, name: string): string | null {
  const direct = node.getAttribute(name);
  if (direct) return direct;
  for (let index = 0; index < node.attributes.length; index++) {
    const attribute = node.attributes.item(index);
    if (attribute?.localName === name) return attribute.value;
  }
  return null;
}

function xmlText(document: Document): string {
  const values: string[] = [];
  for (const node of Array.from(document.getElementsByTagName("*"))) {
    const localName = node.localName || node.nodeName.split(":").pop();
    if (
      localName?.toLowerCase() === "t" &&
      (!node.namespaceURI || DRAWINGML_NAMESPACES.has(node.namespaceURI))
    )
      values.push(node.textContent || "");
  }
  return values.join(" ").replace(/\s+/gu, " ").trim();
}

function relationshipTarget(
  slidePath: string,
  relationshipXml: Buffer | undefined,
): string | undefined {
  if (!relationshipXml) return undefined;
  const document = parseXml(relationshipXml, `${slidePath}.rels`);
  for (const node of Array.from(
    document.getElementsByTagName("Relationship"),
  )) {
    const target = xmlAttributeByLocalName(node, "Target");
    const mode = xmlAttributeByLocalName(node, "TargetMode");
    const type = xmlAttributeByLocalName(node, "Type");
    if (!target || mode?.toLowerCase() === "external") continue;
    if (!type?.endsWith("/notesSlide")) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      continue;
    }
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(slidePath), decoded),
    );
    if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(resolved))
      return resolved;
  }
  return undefined;
}

function orderedPptxSlides(xml: Map<string, Buffer>): string[] {
  const numericSlides = [...xml.keys()]
    .map((filename) => {
      const match = /^ppt\/slides\/slide(\d+)\.xml$/u.exec(filename);
      return match ? { filename, number: Number(match[1]) } : undefined;
    })
    .filter((slide): slide is { filename: string; number: number } => !!slide)
    .sort((a, b) => a.number - b.number)
    .map((slide) => slide.filename);
  const presentationXml = xml.get("ppt/presentation.xml");
  const relationshipsXml = xml.get("ppt/_rels/presentation.xml.rels");
  if (!presentationXml || !relationshipsXml) return numericSlides;

  const relationships = new Map<string, string>();
  const relationshipDocument = parseXml(
    relationshipsXml,
    "ppt/_rels/presentation.xml.rels",
  );
  for (const node of Array.from(
    relationshipDocument.getElementsByTagName("Relationship"),
  )) {
    const type = xmlAttributeByLocalName(node, "Type");
    const id = xmlAttributeByLocalName(node, "Id");
    const target = xmlAttributeByLocalName(node, "Target");
    const mode = xmlAttributeByLocalName(node, "TargetMode");
    if (!id || !target || mode?.toLowerCase() === "external") continue;
    if (!type?.endsWith("/slide")) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      continue;
    }
    const resolved = path.posix.normalize(path.posix.join("ppt", decoded));
    if (/^ppt\/slides\/slide\d+\.xml$/u.test(resolved))
      relationships.set(id, resolved);
  }
  const presentationDocument = parseXml(
    presentationXml,
    "ppt/presentation.xml",
  );
  const ordered: string[] = [];
  for (const node of Array.from(
    presentationDocument.getElementsByTagName("*"),
  )) {
    const localName = node.localName || node.nodeName.split(":").pop();
    if (localName !== "sldId") continue;
    const relationId = xmlAttributeByLocalName(node, "id");
    const slidePath = relationId ? relationships.get(relationId) : undefined;
    if (slidePath && xml.has(slidePath) && !ordered.includes(slidePath))
      ordered.push(slidePath);
  }
  for (const filename of numericSlides)
    if (!ordered.includes(filename)) ordered.push(filename);
  return ordered;
}

async function extractPptx(
  buffer: Buffer,
  signal?: AbortSignal,
): Promise<{ text: string; warnings: string[] }> {
  const xml = await readPptxXml(buffer, signal);
  const slides = orderedPptxSlides(xml);
  if (!slides.length) throw new Error("The PPTX contains no readable slides.");
  const parts: string[] = [];
  const emptySlides: number[] = [];
  for (const [index, slidePath] of slides.entries()) {
    throwIfAborted(signal);
    const slideXml = xml.get(slidePath)!;
    const slideText = xmlText(parseXml(slideXml, slidePath));
    const relPath = `ppt/slides/_rels/${path.posix.basename(slidePath)}.rels`;
    const notesPath = relationshipTarget(slidePath, xml.get(relPath));
    const notesText = notesPath
      ? xmlText(
          parseXml(xml.get(notesPath) || Buffer.from("<empty/>"), notesPath),
        )
      : "";
    const displayNumber = index + 1;
    if (!slideText && !notesText) emptySlides.push(displayNumber);
    parts.push(`[Slide ${displayNumber}]`);
    if (slideText) parts.push(slideText);
    if (notesText) parts.push(`Notes: ${notesText}`);
  }
  return {
    text: parts.join("\n\n"),
    warnings: summarizeNumberWarning(
      "Slide",
      emptySlides,
      "contain no readable text",
    ),
  };
}

function hiddenElement(element: HtmlElement): boolean {
  const attributes = new Map(
    element.attrs.map((attribute) => [
      attribute.name.toLowerCase(),
      attribute.value,
    ]),
  );
  const classOrId = `${attributes.get("class") || ""} ${attributes.get("id") || ""}`;
  return (
    attributes.has("hidden") ||
    attributes.get("aria-hidden")?.toLowerCase() === "true" ||
    /(?:^|[;\s])(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:[;\s]|$)/iu.test(
      attributes.get("style") || "",
    ) ||
    /(?:navigation|navbar|sidebar|cookie|consent|advert|banner|popup|modal|boilerplate)/iu.test(
      classOrId,
    )
  );
}

function usefulHtmlHref(href: string): boolean {
  return /^(?:https?:\/\/|\/|\.\.?\/)/iu.test(href);
}

function htmlToText(html: string): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const output: string[] = [];
  const skipTags = new Set(["script", "style", "nav", "template", "noscript"]);
  const blockTags = new Set([
    "address",
    "article",
    "aside",
    "blockquote",
    "br",
    "dd",
    "div",
    "dl",
    "dt",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "main",
    "p",
    "pre",
    "section",
    "table",
    "td",
    "th",
    "tr",
    "ul",
  ]);
  let nestingWarningAdded = false;
  const visit = (node: HtmlNode, depth: number) => {
    if (node.nodeName === "#text") {
      output.push((node as DefaultTreeAdapterTypes.TextNode).value);
      return;
    }
    if (!("tagName" in node)) return;
    const element = node as HtmlElement;
    const tag = element.tagName.toLowerCase();
    if (skipTags.has(tag) || hiddenElement(element)) return;
    if (depth > MAX_HTML_DEPTH) {
      if (!nestingWarningAdded) {
        warnings.push("HTML nesting was truncated at the safety limit.");
        nestingWarningAdded = true;
      }
      return;
    }
    const isBlock = blockTags.has(tag);
    if (isBlock) output.push("\n");
    const start = output.length;
    for (const child of element.childNodes) visit(child, depth + 1);
    if (tag === "a") {
      const href = element.attrs
        .find((attribute) => attribute.name.toLowerCase() === "href")
        ?.value.trim();
      const linkText = output.slice(start).join("").trim();
      if (href && linkText && usefulHtmlHref(href) && !linkText.includes(href))
        output.push(` (${href})`);
    }
    if (isBlock) output.push("\n");
  };
  const fragment = parseFragment(html);
  for (const child of fragment.childNodes) visit(child, 0);
  const text = output
    .join("")
    .replace(/[ \t\r\f\v]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return { text, warnings };
}

async function extractPdf(
  buffer: Buffer,
  signal?: AbortSignal,
): Promise<{ text: string; warnings: string[]; ocrCandidate: boolean }> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    CanvasFactory: UtilityCanvasFactory,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  let text = "";
  const lowTextPages: number[] = [];
  try {
    if (pdf.numPages > MAX_PDF_PAGES)
      throw new Error(
        "This PDF has more than 600 pages. Split it into course sections.",
      );
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) =>
          "str" in item
            ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
            : "",
        )
        .join("");
      if (pageText.trim().length < 20) lowTextPages.push(pageNumber);
      text += `\n\n[Page ${pageNumber}]\n` + pageText;
      if (text.length > MAX_TEXT_LENGTH)
        throw new Error(
          "This PDF is too large. Split it into course sections.",
        );
    }
  } finally {
    await loadingTask.destroy();
  }
  const ocrCandidate = lowTextPages.length > 0;
  const warnings = summarizeNumberWarning(
    "Page",
    lowTextPages,
    "contain little or no selectable text; OCR may be needed",
  );
  const readable = text.replace(/\[(?:Page|Slide) \d+\]/gu, "").trim();
  if (!readable) {
    return {
      text: "",
      warnings: [
        ...warnings,
        "No selectable text was found in this PDF; run OCR to make it searchable.",
      ],
      ocrCandidate: true,
    };
  }
  return { text, warnings, ocrCandidate };
}

/** Extract bounded study text from supported source documents. */
export async function extractDocument(
  buffer: Buffer,
  filename: string,
  signal?: AbortSignal,
): Promise<DocumentExtraction> {
  throwIfAborted(signal);
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_INPUT_BYTES)
    throw new Error("The uploaded document exceeds the 20 MB limit.");
  const ext = path.extname(filename).toLowerCase();
  let text: string;
  let extraction: string;
  let warnings: string[] = [];
  let ocrCandidate = false;
  if ([".txt", ".md", ".markdown", ".csv"].includes(ext)) {
    text = buffer.toString("utf8");
    extraction = "UTF-8 text";
  } else if (ext === ".docx") {
    await validateZipBudget(buffer, signal);
    text = (await mammoth.extractRawText({ buffer })).value;
    extraction = "mammoth 1.12.2; raw text";
  } else if (ext === ".pdf") {
    const parsed = await extractPdf(buffer, signal);
    text = parsed.text;
    warnings = parsed.warnings;
    ocrCandidate = parsed.ocrCandidate;
    extraction = "pdfjs-dist 6.3.289; page markers";
  } else if ([".html", ".htm"].includes(ext)) {
    const parsed = htmlToText(buffer.toString("utf8"));
    text = parsed.text;
    warnings = parsed.warnings;
    extraction = "HTML study text; sanitized";
  } else if (ext === ".pptx") {
    const parsed = await extractPptx(buffer, signal);
    text = parsed.text;
    warnings = parsed.warnings;
    extraction = "PPTX slide and notes text; Open XML";
  } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
    validateImage(buffer, ext);
    text = "";
    warnings = ["Image text is not available until OCR is run."];
    extraction = "Image awaiting OCR";
    ocrCandidate = true;
  } else {
    throw new Error(
      "Supported files: PDF, DOCX, HTML, PPTX, PNG, JPG, JPEG, Markdown, TXT and CSV.",
    );
  }
  return {
    text: enforceTextLimit(text, signal, ext === ".pdf" || ocrCandidate),
    extraction,
    warnings,
    ...(ocrCandidate ? { ocrCandidate: true } : {}),
  };
}
