const { createWriteStream } = require("node:fs");
const { lstat, rename, rm } = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const MAX_PATH_LENGTH = 2048;
const MAX_NAME_LENGTH = 180;
const MAX_ERROR_BYTES = 64 * 1024;
const MAX_ERROR_CHARS = 600;
const MAX_ACTIVE_DOWNLOADS = 3;
const PROGRESS_INTERVAL_MS = 200;

function isUuid(value) {
  return typeof value === "string" && new RegExp(`^${UUID}$`, "iu").test(value);
}

function errorForStatus(status) {
  return new Error(`Download failed (HTTP ${status}).`);
}

function safeErrorText(value, secret) {
  if (typeof value !== "string") return undefined;
  let redacted = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(
      /((?:authorization|x-sennibook-desktop|api[-_ ]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/giu,
      "$1[redacted]",
    )
    .replace(/\s+/gu, " ")
    .trim();
  if (secret) redacted = redacted.split(secret).join("[redacted]");
  return redacted ? redacted.slice(0, MAX_ERROR_CHARS) : undefined;
}

async function readBoundedError(response, secret) {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size <= MAX_ERROR_BYTES) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = Buffer.from(result.value);
      const remaining = MAX_ERROR_BYTES + 1 - size;
      chunks.push(chunk.subarray(0, remaining));
      size += Math.min(chunk.length, remaining);
      if (size > MAX_ERROR_BYTES) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* The body is only an error diagnostic; cancellation is best effort. */
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const value = JSON.parse(text);
    return safeErrorText(value && value.error, secret);
  } catch {
    return undefined;
  }
}

function openExclusiveWriteStream(filename) {
  const output = createWriteStream(filename, { flags: "wx" });
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      output.removeListener("open", opened);
      output.removeListener("error", failed);
    };
    const opened = () => {
      cleanup();
      resolve(output);
    };
    const failed = (error) => {
      cleanup();
      reject(error);
    };
    output.once("open", opened);
    output.once("error", failed);
  });
}

function defaultName(requestPath) {
  if (requestPath.endsWith("/bundle")) return "sennibook-notebook.zip";
  if (requestPath.endsWith("/export")) return "sennibook-notebook.md";
  if (requestPath.includes("/episodes/") && requestPath.includes("/download"))
    return requestPath.includes("format=mp3")
      ? "sennibook-episode.mp3"
      : "sennibook-episode.wav";
  if (requestPath.startsWith("/api/audio/"))
    return path.basename(requestPath.split("?", 1)[0]);
  return "sennibook-download";
}

function validatePath(requestPath) {
  if (
    typeof requestPath !== "string" ||
    !requestPath.length ||
    requestPath.length > MAX_PATH_LENGTH ||
    requestPath.includes("\0") ||
    !requestPath.startsWith("/api/")
  )
    throw new Error("Download address is invalid.");
  let url;
  try {
    url = new URL(requestPath, "http://sennibook.invalid");
  } catch {
    throw new Error("Download address is invalid.");
  }
  if (
    url.origin !== "http://sennibook.invalid" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    url.pathname !== requestPath.split("?", 1)[0]
  )
    throw new Error("Download address is invalid.");

  const exportMatch = requestPath.match(
    new RegExp(`^/api/notebooks/${UUID}/(bundle|export)$`, "iu"),
  );
  if (exportMatch && url.searchParams.size === 0) return url.pathname;
  if (
    new RegExp(`^/api/notebooks/${UUID}/sources/${UUID}/original$`, "iu").test(
      url.pathname,
    )
  ) {
    const keys = [...url.searchParams.keys()];
    if (keys.length === 0) return url.pathname;
    if (
      keys.length === 1 &&
      keys[0] === "episode" &&
      isUuid(url.searchParams.get("episode"))
    )
      return `${url.pathname}?episode=${encodeURIComponent(url.searchParams.get("episode"))}`;
  }
  if (
    new RegExp(`^/api/notebooks/${UUID}/episodes/${UUID}/download$`, "iu").test(
      url.pathname,
    )
  ) {
    const keys = [...url.searchParams.keys()];
    const format = url.searchParams.get("format");
    if (
      keys.length === 1 &&
      keys[0] === "format" &&
      ["wav", "mp3"].includes(format)
    )
      return `${url.pathname}?format=${format}`;
  }
  if (
    /^\/api\/audio\/[0-9a-f-]+(?:-preview)?\.wav$/iu.test(url.pathname) &&
    url.searchParams.size === 0
  )
    return url.pathname;
  throw new Error("Download address is not an allowed file.");
}

function validateName(value, requestPath) {
  if (value !== undefined && typeof value !== "string")
    throw new Error("Download filename is invalid.");
  const raw = value || defaultName(requestPath);
  let cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/u, "");
  const extension = path.win32.extname(cleaned);
  if (cleaned.length > MAX_NAME_LENGTH && extension.length < MAX_NAME_LENGTH) {
    cleaned =
      cleaned
        .slice(0, MAX_NAME_LENGTH - extension.length)
        .replace(/[. ]+$/u, "") + extension;
  } else {
    cleaned = cleaned.slice(0, MAX_NAME_LENGTH).replace(/[. ]+$/u, "");
  }
  if (!cleaned || cleaned === "." || cleaned === "..")
    throw new Error("Download filename is invalid.");
  const stem = cleaned.split(".", 1)[0].trimEnd();
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu.test(stem)) {
    const prefixed = `_${cleaned}`;
    cleaned =
      prefixed.length <= MAX_NAME_LENGTH
        ? prefixed
        : `_${stem.slice(0, MAX_NAME_LENGTH - extension.length - 1)}${extension}`;
  }
  return cleaned;
}

async function validateDestination(finalPath) {
  try {
    const info = await lstat(finalPath);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error(
        "Choose a regular file destination, not a folder or link.",
      );
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function publishError(error) {
  if (["EEXIST", "EPERM", "ENOTEMPTY"].includes(error?.code))
    return new Error(
      "Could not replace the existing file. Its original bytes were retained; choose another name.",
    );
  return error;
}

function createDownloadManager({
  getWindow,
  getOrigin,
  token,
  showSaveDialog,
  onProgress,
}) {
  const active = new Map();

  function emitProgress(info) {
    try {
      onProgress?.(info);
    } catch {
      /* A closed renderer must not interrupt a file transfer. */
    }
  }

  async function download(input) {
    if (!input || !isUuid(input.id)) throw new Error("Download ID is invalid.");
    if (active.has(input.id))
      throw new Error("This download is already running.");
    if (active.size >= MAX_ACTIVE_DOWNLOADS)
      throw new Error(
        "Too many downloads are already running. Try again shortly.",
      );
    const requestPath = validatePath(input.path);
    const suggestedName = validateName(input.suggestedName, requestPath);
    const operation = {
      controller: null,
      cancelled: false,
      tempPath: undefined,
    };
    active.set(input.id, operation);
    try {
      const save = await showSaveDialog(getWindow(), {
        title: "Save SenniBook download",
        defaultPath: suggestedName,
        buttonLabel: "Save",
        properties: ["showOverwriteConfirmation"],
      });
      if (save.canceled || !save.filePath || operation.cancelled)
        return { status: "cancelled" };
      const finalPath = path.resolve(save.filePath);
      await validateDestination(finalPath);
      if (operation.cancelled) return { status: "cancelled" };
      // Let the renderer leave its save-location state while the backend is
      // still validating/preparing a potentially large streamed export.
      emitProgress({ id: input.id, received: 0 });

      const controller = new AbortController();
      operation.controller = controller;
      const response = await fetch(`${getOrigin()}${requestPath}`, {
        headers: { "x-sennibook-desktop": token },
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        const detail = await readBoundedError(response, token);
        throw new Error(detail || errorForStatus(response.status).message);
      }
      if (!response.body)
        throw new Error("The server returned an empty download.");
      if (operation.cancelled) {
        await response.body.cancel().catch(() => {});
        return { status: "cancelled" };
      }
      const totalHeader = response.headers.get("content-length");
      const parsedTotal =
        totalHeader && /^\d+$/u.test(totalHeader) ? Number(totalHeader) : NaN;
      const total = Number.isSafeInteger(parsedTotal) ? parsedTotal : undefined;
      let received = 0;
      let lastProgressAt = 0;
      const reportProgress = (force = false) => {
        const now = Date.now();
        if (
          !force &&
          received > 0 &&
          now - lastProgressAt < PROGRESS_INTERVAL_MS
        )
          return;
        lastProgressAt = now;
        emitProgress({
          id: input.id,
          received,
          ...(total === undefined ? {} : { total }),
        });
      };
      reportProgress(true);
      const count = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          reportProgress();
          callback(null, chunk);
        },
      });
      const temporary = path.join(
        path.dirname(finalPath),
        `.${path.basename(finalPath)}.sennibook-${input.id}.part`,
      );
      let output;
      try {
        output = await openExclusiveWriteStream(temporary);
        operation.tempPath = temporary;
        if (operation.cancelled) {
          output.destroy();
          await response.body.cancel().catch(() => {});
          return { status: "cancelled" };
        }
        const source = Readable.fromWeb(response.body);
        await pipeline(source, count, output, { signal: controller.signal });
      } catch (error) {
        await response.body.cancel().catch(() => {});
        throw error;
      }
      if (operation.cancelled) return { status: "cancelled" };
      if (total !== undefined && received !== total)
        throw new Error("The download was incomplete. Try again.");
      await validateDestination(finalPath);
      if (operation.cancelled) return { status: "cancelled" };
      try {
        await rename(temporary, finalPath);
      } catch (error) {
        throw publishError(error);
      }
      operation.tempPath = undefined;
      reportProgress(true);
      return { status: "completed", filename: path.basename(finalPath) };
    } catch (error) {
      if (operation.cancelled || operation.controller?.signal.aborted)
        return { status: "cancelled" };
      const message = safeErrorText(error?.message, token);
      throw new Error(message || "Download failed.");
    } finally {
      active.delete(input.id);
      if (operation.tempPath)
        await rm(operation.tempPath, { force: true }).catch(() => {});
    }
  }

  async function cancelDownload(id) {
    if (!isUuid(id)) throw new Error("Download ID is invalid.");
    const operation = active.get(id);
    if (!operation) return;
    operation.cancelled = true;
    operation.controller?.abort(new Error("Download cancelled."));
  }

  async function cancelAll() {
    const operations = [...active.entries()];
    for (const [id] of operations) await cancelDownload(id);
    await Promise.allSettled(
      operations.map(([, operation]) => operation.promise).filter(Boolean),
    );
  }

  return {
    download(input) {
      const promise = download(input);
      const operation = active.get(input?.id);
      if (operation) operation.promise = promise;
      return promise;
    },
    cancelDownload,
    cancelAll,
    hasActive: () => active.size > 0,
  };
}

module.exports = { createDownloadManager, validatePath, validateName };
