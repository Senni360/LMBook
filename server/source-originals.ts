import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  sourceAttachmentSchema,
  type SourceAttachment,
} from "../shared/model.ts";

const MAX_BYTES = 512 * 1024 * 1024;
export function originalPath(directory: string, sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256))
    throw new Error("Invalid original file reference.");
  const root = path.resolve(directory);
  const target = path.resolve(root, sha256);
  if (!target.startsWith(root + path.sep))
    throw new Error("Invalid original file location.");
  return target;
}

export async function hashOriginal(filename: string, signal?: AbortSignal) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES)
    throw new Error(
      "Original source is missing, unsafe or larger than 512 MB.",
    );
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename, { signal }))
    hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyOriginal(
  directory: string,
  attachment: SourceAttachment,
  signal?: AbortSignal,
) {
  const metadata = sourceAttachmentSchema.parse(attachment);
  const filename = originalPath(directory, metadata.sha256);
  const info = await lstat(filename);
  if (
    info.size !== metadata.bytes ||
    (await hashOriginal(filename, signal)) !== metadata.sha256
  )
    throw new Error(
      "An original source file is incomplete or has changed. Import the original again.",
    );
  return filename;
}

/** Store exact bytes under their hash. Publish only after the complete file is written. */
export async function storeOriginal(
  directory: string,
  input: Buffer | string,
  filename: string,
  mediaType: string,
  signal?: AbortSignal,
): Promise<SourceAttachment> {
  signal?.throwIfAborted();
  await mkdir(directory, { recursive: true });
  const temporary = path.resolve(directory, `.incoming-${randomUUID()}`);
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        callback(new Error("Original source exceeds 512 MB."));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    const source =
      typeof input === "string"
        ? createReadStream(input)
        : Readable.from([input]);
    await pipeline(
      source,
      meter,
      createWriteStream(temporary, { flags: "wx" }),
      { signal },
    );
    const attachment = sourceAttachmentSchema.parse({
      sha256: hash.digest("hex"),
      filename: path.basename(filename).slice(0, 500),
      bytes,
      mediaType,
    });
    signal?.throwIfAborted();
    const target = originalPath(directory, attachment.sha256);
    // A concurrent import of identical bytes has the same immutable destination.
    // Renaming a fully written file keeps readers from observing partial content.
    try {
      await rename(temporary, target);
    } catch (error) {
      if (
        !["EEXIST", "EPERM"].includes(
          (error as NodeJS.ErrnoException).code || "",
        )
      )
        throw error;
      await verifyOriginal(directory, attachment, signal);
    }
    return attachment;
  } finally {
    if (
      path.dirname(temporary) === path.resolve(directory) &&
      path.basename(temporary).startsWith(".incoming-")
    )
      await rm(temporary, { force: true });
  }
}
