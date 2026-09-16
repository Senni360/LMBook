import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

const allowed = [
  "0.3.9",
  "0.3.10",
  "0.3.11",
  "0.3.12",
  "0.3.13",
  "0.3.14",
  "0.3.15",
  "0.3.16",
];
const shaPattern = /^[a-f0-9]{40}$/;
const root = process.cwd();
const manifestPath = path.join(root, "release-batch.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!manifest || !Array.isArray(manifest.versions))
  throw new Error("release-batch.json must contain a versions array.");
if (manifest.approvedAt !== "2026-09-17")
  throw new Error("release-batch.json must record approval on 2026-09-17.");
if (manifest.versions.length !== allowed.length)
  throw new Error(
    "The batch must contain exactly versions 0.3.9 through 0.3.16.",
  );
const seen = new Set();
const versions = manifest.versions.map((entry, index) => {
  if (
    !entry ||
    typeof entry.version !== "string" ||
    !shaPattern.test(entry.sha || "")
  )
    throw new Error(`Invalid batch entry at index ${index}.`);
  if (seen.has(entry.version))
    throw new Error(`Duplicate batch version: ${entry.version}.`);
  seen.add(entry.version);
  return { version: entry.version, sha: entry.sha };
});
if (versions.some((entry, index) => entry.version !== allowed[index]))
  throw new Error(
    "Batch versions must be sorted exactly from 0.3.9 through 0.3.16.",
  );

function show(sha, file) {
  try {
    return execFileSync("git", ["show", `${sha}:${file}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(`${sha} does not contain ${file}.`);
  }
}
for (const { version, sha } of versions) {
  let packageJson;
  let lockJson;
  try {
    packageJson = JSON.parse(show(sha, "package.json"));
    lockJson = JSON.parse(show(sha, "package-lock.json"));
  } catch (error) {
    throw new Error(
      `Could not validate package metadata for ${version}: ${error.message}`,
    );
  }
  if (
    packageJson.version !== version ||
    lockJson.version !== version ||
    lockJson.packages?.[""].version !== version
  )
    throw new Error(`Package metadata at ${sha} is not version ${version}.`);
  show(sha, `docs/releases/${version}.md`);
}

const targets = [
  {
    target: "windows-x64",
    os: "windows-latest",
    args: "--win --x64",
    executable: "release/win-unpacked/LMBook.exe",
    app: "",
  },
  {
    target: "mac-arm64",
    os: "macos-15",
    args: "--mac --arm64",
    executable: "release/mac-arm64/LMBook.app/Contents/MacOS/LMBook",
    app: "release/mac-arm64/LMBook.app",
  },
  {
    target: "mac-x64",
    os: "macos-15-intel",
    args: "--mac --x64",
    executable: "release/mac/LMBook.app/Contents/MacOS/LMBook",
    app: "release/mac/LMBook.app",
  },
];
const build = versions.flatMap((entry) =>
  targets.map((target) => ({ ...entry, ...target })),
);
const publish = versions;
const output = process.env.GITHUB_OUTPUT;
if (output) {
  await appendFile(output, `build=${JSON.stringify({ include: build })}\n`);
  await appendFile(output, `publish=${JSON.stringify({ include: publish })}\n`);
}
console.log(
  JSON.stringify(
    { build: { include: build }, publish: { include: publish } },
    null,
    2,
  ),
);
