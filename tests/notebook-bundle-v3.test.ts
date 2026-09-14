import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import yauzl from "yauzl";
import test, { after } from "node:test";
import {
  settingsSchema,
  uid,
  type Episode,
  type Notebook,
  type Source,
} from "../shared/model.ts";
import {
  createNotebookBundle,
  importNotebookBundle,
} from "../server/notebook-bundle.ts";

type ZipEntry = { name: string; content: Buffer };

const roots: string[] = [];
after(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function bundleBytes(
  notebook: Notebook,
  audioDir: string,
  originalsDir?: string,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of createNotebookBundle(notebook, audioDir, {
    originalsDir,
  }))
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readZip(buffer: Buffer): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: ZipEntry[] = [];
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip)
        return reject(error || new Error("Could not open ZIP."));
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream)
            return reject(
              streamError || new Error("Could not read ZIP entry."),
            );
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.once("error", reject);
          stream.once("end", () => {
            entries.push({
              name: entry.fileName,
              content: Buffer.concat(chunks),
            });
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

async function writeZip(entries: ZipEntry[]) {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  const ended = new Promise<void>((resolve, reject) => {
    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    output.once("end", resolve);
    output.once("error", reject);
  });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.pipe(output);
  for (const entry of entries)
    archive.append(entry.content, { name: entry.name });
  await archive.finalize();
  await ended;
  return Buffer.concat(chunks);
}

function source(text: string, attachment?: Source["attachment"]): Source {
  return {
    id: uid(),
    title: "Source",
    text,
    kind: "course",
    createdAt: new Date().toISOString(),
    ...(attachment ? { attachment } : {}),
  };
}

function wav() {
  const result = Buffer.alloc(46);
  result.write("RIFF");
  result.writeUInt32LE(38, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(24000, 24);
  result.writeUInt32LE(48000, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(2, 40);
  return result;
}

function episode(sources: Source[] | undefined, withAudio: boolean): Episode {
  const chapterId = uid();
  const audioFile = `${chapterId}.wav`;
  return {
    id: uid(),
    title: "Episode",
    createdAt: new Date().toISOString(),
    settings: settingsSchema.parse({}),
    ...(sources ? { sources } : {}),
    objectives: [],
    status: "complete",
    progress: "Ready",
    chapters: [
      {
        id: chapterId,
        title: "Chapter",
        minutes: 5,
        objectiveIds: [],
        summary: "Summary",
        turns: [],
        ...(withAudio ? { audioFile } : {}),
      },
    ],
  };
}

async function fixture(large: boolean) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sennibook-bundle-v3-"));
  roots.push(root);
  const audioDir = path.join(root, "audio");
  const originalsDir = path.join(root, "originals");
  await mkdir(audioDir, { recursive: true });
  await mkdir(originalsDir, { recursive: true });
  const now = new Date().toISOString();
  const text = large ? "x".repeat(5 * 1024 * 1024) : "small source";
  const originalBytes = Buffer.from("original bytes");
  const originalSha256 = createHash("sha256")
    .update(originalBytes)
    .digest("hex");
  const attachment = {
    sha256: originalSha256,
    filename: "source.txt",
    bytes: originalBytes.length,
    mediaType: "text/plain",
  };
  const current = source(text, large ? attachment : undefined);
  const changed = source(
    large ? `y${text.slice(1)}` : "changed",
    large ? attachment : undefined,
  );
  const episodes = large
    ? [
        episode(undefined, true),
        episode([current], true),
        episode([current], true),
        episode([changed], true),
      ]
    : [episode(undefined, false)];
  for (const item of episodes)
    if (item.chapters[0].audioFile)
      await writeFile(path.join(audioDir, item.chapters[0].audioFile), wav());
  if (large)
    await writeFile(path.join(originalsDir, originalSha256), originalBytes);
  const notebook: Notebook = {
    id: uid(),
    title: large ? "Large backup" : "Small backup",
    description: "",
    example: false,
    createdAt: now,
    updatedAt: now,
    settings: settingsSchema.parse({}),
    sources: [current],
    objectives: [],
    coverage: [],
    episodes,
    messages: [],
  };
  return { root, audioDir, originalsDir, notebook, originalSha256 };
}

test("keeps small backups compatible with v2", async () => {
  const fixtureData = await fixture(false);
  const archivePath = path.join(fixtureData.root, "small.zip");
  await writeFile(
    archivePath,
    await bundleBytes(
      fixtureData.notebook,
      fixtureData.audioDir,
      fixtureData.originalsDir,
    ),
  );
  const manifest = JSON.parse(
    (await readZip(await readFile(archivePath)))
      .find((entry) => entry.name === "notebook.json")!
      .content.toString(),
  );
  assert.equal(manifest.version, 2);
  const imported = await importNotebookBundle(
    archivePath,
    path.join(fixtureData.root, "restored-audio"),
    { originalsDir: path.join(fixtureData.root, "restored-originals") },
  );
  assert.notEqual(imported.notebook.id, fixtureData.notebook.id);
  assert.equal(imported.notebook.episodes.length, 1);
  await imported.cleanup();
});

test("round-trips deduplicated and changed v3 snapshots with files and remapped IDs", async () => {
  const fixtureData = await fixture(true);
  const archivePath = path.join(fixtureData.root, "large.zip");
  await writeFile(
    archivePath,
    await bundleBytes(
      fixtureData.notebook,
      fixtureData.audioDir,
      fixtureData.originalsDir,
    ),
  );
  const entries = await readZip(await readFile(archivePath));
  const manifest = JSON.parse(
    entries.find((entry) => entry.name === "notebook.json")!.content.toString(),
  );
  assert.equal(manifest.version, 3);
  assert.equal(
    manifest.entries.filter(
      (entry: { kind: string }) => entry.kind === "source-snapshot",
    ).length,
    2,
  );
  const imported = await importNotebookBundle(
    archivePath,
    path.join(fixtureData.root, "restored-audio"),
    { originalsDir: path.join(fixtureData.root, "restored-originals") },
  );
  assert.notEqual(imported.notebook.id, fixtureData.notebook.id);
  assert.equal(
    imported.notebook.sources[0].text,
    fixtureData.notebook.sources[0].text,
  );
  assert.equal(imported.notebook.episodes[0].sources, undefined);
  assert.equal(
    imported.notebook.episodes[1].sources?.[0].text,
    fixtureData.notebook.sources[0].text,
  );
  assert.equal(
    imported.notebook.episodes[2].sources?.[0].text,
    fixtureData.notebook.sources[0].text,
  );
  assert.notEqual(
    imported.notebook.episodes[3].sources?.[0].text,
    fixtureData.notebook.sources[0].text,
  );
  assert.ok(
    (
      await readFile(
        path.join(
          fixtureData.root,
          "restored-audio",
          imported.notebook.episodes[0].chapters[0].audioFile!,
        ),
      )
    ).length > 0,
  );
  assert.ok(
    (
      await readFile(
        path.join(
          fixtureData.root,
          "restored-originals",
          fixtureData.originalSha256,
        ),
      )
    ).length > 0,
  );
  await imported.cleanup();
});

test("rejects malformed snapshots and amplification before publishing originals", async () => {
  const fixtureData = await fixture(true);
  const sourceArchive = await bundleBytes(
    fixtureData.notebook,
    fixtureData.audioDir,
    fixtureData.originalsDir,
  );
  const sourceEntries = await readZip(sourceArchive);
  const snapshot = sourceEntries.find((entry) =>
    entry.name.startsWith("sources/"),
  )!;
  const textOffset =
    snapshot.content.indexOf(Buffer.from('"text":"')) +
    Buffer.byteLength('"text":"');
  const tampered = Buffer.from(snapshot.content);
  tampered[textOffset] = tampered[textOffset] === 120 ? 121 : 120;
  const badHashArchive = await writeZip(
    sourceEntries.map((entry) =>
      entry === snapshot ? { ...entry, content: tampered } : entry,
    ),
  );
  const badHashPath = path.join(fixtureData.root, "bad-hash.zip");
  await writeFile(badHashPath, badHashArchive);
  const badOriginals = path.join(fixtureData.root, "bad-hash-originals");
  await assert.rejects(
    importNotebookBundle(
      badHashPath,
      path.join(fixtureData.root, "bad-hash-audio"),
      { originalsDir: badOriginals },
    ),
    /hash mismatch/iu,
  );
  await assert.rejects(
    readFile(path.join(badOriginals, fixtureData.originalSha256)),
  );

  const amplificationEntries = sourceEntries.map((entry) => ({
    ...entry,
    content: Buffer.from(entry.content),
  }));
  const amplificationManifest = JSON.parse(
    amplificationEntries
      .find((entry) => entry.name === "notebook.json")!
      .content.toString(),
  );
  const sourceManifestEntries = amplificationManifest.entries.filter(
    (entry: { kind: string }) => entry.kind === "source-snapshot",
  );
  const sourceEntry = sourceManifestEntries[0];
  const sourceContent = amplificationEntries.find((entry) =>
    entry.name.startsWith("sources/"),
  )!.content;
  const amplificationSnapshots = Array.from({ length: 5 }, (_, index) => {
    const hash = index === 0 ? sourceEntry.sha256 : String(index).repeat(64);
    return {
      ...sourceEntry,
      path: `sources/${hash}.json`,
      sha256: hash,
      size: 32 * 1024 * 1024,
    };
  });
  amplificationManifest.entries = amplificationManifest.entries.filter(
    (entry: { kind: string }) => entry.kind !== "source-snapshot",
  );
  amplificationManifest.entries.push(...amplificationSnapshots);
  const nonSnapshotEntries = amplificationEntries.filter(
    (entry) => !entry.name.startsWith("sources/"),
  );
  amplificationEntries.splice(
    0,
    amplificationEntries.length,
    ...nonSnapshotEntries,
    ...amplificationSnapshots.map((entry) => ({
      name: entry.path,
      content: Buffer.from(sourceContent),
    })),
  );
  amplificationEntries.find(
    (entry) => entry.name === "notebook.json",
  )!.content = Buffer.from(JSON.stringify(amplificationManifest));
  const amplificationPath = path.join(fixtureData.root, "amplification.zip");
  await writeFile(amplificationPath, await writeZip(amplificationEntries));
  const amplificationOriginals = path.join(
    fixtureData.root,
    "amplification-originals",
  );
  await assert.rejects(
    importNotebookBundle(
      amplificationPath,
      path.join(fixtureData.root, "amplification-audio"),
      { originalsDir: amplificationOriginals },
    ),
    /declared source snapshots exceed/iu,
  );
  await assert.rejects(
    readFile(path.join(amplificationOriginals, fixtureData.originalSha256)),
  );
});
