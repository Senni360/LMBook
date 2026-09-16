import { createReadStream } from "node:fs";
import {
  appendFile,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const command = process.argv[2];
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const version = pkg.version;
// Batch approval belongs to the trusted workflow checkout. Historical app
// checkouts may predate release-policy.json and must not approve themselves.
const batchVersion = process.env.LMBOOK_RELEASE_BATCH_VERSION;
const policy = JSON.parse(
  await readFile(
    batchVersion
      ? new URL("../release-policy.json", import.meta.url)
      : "release-policy.json",
    "utf8",
  ),
);
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
if (
  !stableVersion.test(policy.targetVersion) ||
  (policy.approvedVersion !== null &&
    (!stableVersion.test(policy.approvedVersion) ||
      policy.approvedVersion !== policy.targetVersion))
)
  throw new Error(
    "Invalid release policy: approval must name the target version or be null.",
  );
let approved = policy.approvedVersion === version;
if (batchVersion) {
  const batch = JSON.parse(
    await readFile(new URL("../release-batch.json", import.meta.url), "utf8"),
  );
  const entries =
    batch.versions?.filter((entry) => entry.version === version) || [];
  if (
    batch.approvedAt !== "2026-09-17" ||
    batchVersion !== version ||
    entries.length !== 1 ||
    entries[0].sha !== process.env.LMBOOK_RELEASE_SOURCE_SHA ||
    !/^0\.3\.(9|1[0-6])$/.test(version)
  ) {
    throw new Error(
      "This version and source commit are not approved for the release batch.",
    );
  }
  approved = true;
}
if (command === "publish" && !approved)
  throw new Error(
    `Publication of v${version} is not approved. Iteration builds remain unpublished until the owner approves the target release.`,
  );
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
  throw new Error("Release versions must be stable MAJOR.MINOR.PATCH numbers.");
if (lock.version !== version || lock.packages[""].version !== version)
  throw new Error(
    "package.json and package-lock.json must have the same version.",
  );
const repo = process.env.GITHUB_REPOSITORY;
const sha = batchVersion
  ? process.env.LMBOOK_RELEASE_SOURCE_SHA
  : process.env.GITHUB_SHA;
if (
  !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo || "") ||
  !/^[a-f0-9]{40}$/.test(sha || "")
)
  throw new Error(
    "Set GITHUB_REPOSITORY and the full GITHUB_SHA being released.",
  );
const tag = `v${version}`;
const directory = ".work/release-assets";
const targets = {
  "windows-x64": [
    [`LMBook-${version}-portable.exe`, `LMBook-${version}-portable.exe`],
    [`LMBook Setup ${version}.exe`, `LMBook-Setup-${version}.exe`],
  ],
  "mac-arm64": [
    [`LMBook-${version}-mac-arm64.dmg`, `LMBook-${version}-mac-arm64.dmg`],
    [`LMBook-${version}-mac-arm64.zip`, `LMBook-${version}-mac-arm64.zip`],
  ],
  "mac-x64": [
    [`LMBook-${version}-mac-x64.dmg`, `LMBook-${version}-mac-x64.dmg`],
    [`LMBook-${version}-mac-x64.zip`, `LMBook-${version}-mac-x64.zip`],
  ],
};
const names = [
  ...Object.values(targets)
    .flat()
    .map(([, name]) => name),
  "SHA256SUMS.txt",
];
const notes = await readFile(`docs/releases/${version}.md`, "utf8");

async function request(
  endpoint,
  { method = "GET", body, missing = false } = {},
) {
  if (!process.env.GITHUB_TOKEN)
    throw new Error("GITHUB_TOKEN is required for GitHub requests.");
  const response = await fetch(
    `https://api.github.com/repos/${repo}/${endpoint}`,
    {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (missing && response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `GitHub ${method} ${endpoint} failed (${response.status}).`,
    );
  return response.status === 204 ? null : response.json();
}
async function summary(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}
async function output(key, value) {
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
async function releaseState() {
  const release = await request(`releases/tags/${tag}`, { missing: true });
  // Never attach a new binary to another commit's tag or draft.
  let ref = (await request(`git/ref/tags/${tag}`, { missing: true }))?.object;
  for (let depth = 0; ref?.type === "tag" && depth < 5; depth++)
    ref = (await request(`git/tags/${ref.sha}`)).object;
  if (ref && (ref.type !== "commit" || ref.sha !== sha))
    throw new Error(
      `${tag} already refers to a different commit. Bump the version; tags are never moved.`,
    );
  if (release && !release.draft) {
    if (!ref)
      throw new Error(`${tag} is published but its source tag is missing.`);
    return { release, published: true };
  }
  if (release && release.target_commitish !== sha)
    throw new Error(
      `${tag} has a draft for another commit. Inspect that draft before retrying.`,
    );
  return { release, published: false };
}
async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

if (command === "plan") {
  const { published } =
    process.env.GITHUB_EVENT_NAME === "pull_request" || !approved
      ? { published: false }
      : await releaseState();
  await output("build", String(!published));
  await output(
    "publish",
    String(
      approved &&
        !published &&
        process.env.GITHUB_EVENT_NAME !== "pull_request",
    ),
  );
  await output("version", version);
  await summary(
    published
      ? `${tag} is already published; no downloads will be replaced.`
      : approved
        ? `Build and verify ${tag} from ${sha} before publication.`
        : `Build and verify ${tag} as an unpublished iteration toward v${policy.targetVersion}. Owner release approval is pending.`,
  );
} else if (command === "stage") {
  const target = process.argv[3];
  if (!Object.hasOwn(targets, target))
    throw new Error("Choose windows-x64, mac-arm64 or mac-x64.");
  const outputDir = path.join(directory, target);
  await mkdir(outputDir, { recursive: true });
  if ((await readdir(outputDir)).length)
    throw new Error("Artifact staging directory must be empty.");
  const files = [];
  for (const [source, name] of targets[target]) {
    const file = path.join("release", source);
    if ((await stat(file)).size < 1_000_000)
      throw new Error(`Unexpectedly small download: ${file}`);
    await copyFile(file, path.join(outputDir, name));
    files.push({
      name,
      sha256: await digest(file),
      size: (await stat(file)).size,
    });
  }
  await writeFile(
    path.join(outputDir, "manifest.json"),
    JSON.stringify({ version, sha, target, files }, null, 2),
  );
  await summary(`Prepared checked ${target} downloads for ${tag}.`);
} else if (command === "collect") {
  const files = [];
  for (const [target, expected] of Object.entries(targets)) {
    const inputDir = path.join(directory, target);
    const manifest = JSON.parse(
      await readFile(path.join(inputDir, "manifest.json"), "utf8"),
    );
    if (
      manifest.version !== version ||
      manifest.sha !== sha ||
      manifest.target !== target ||
      manifest.files?.length !== expected.length ||
      manifest.files.some((file, i) => file.name !== expected[i][1])
    )
      throw new Error(`Artifact manifest mismatch: ${target}`);
    for (const file of manifest.files) {
      const source = path.join(inputDir, file.name);
      if (
        (await stat(source)).size !== file.size ||
        (await digest(source)) !== file.sha256
      )
        throw new Error(`Artifact checksum mismatch: ${file.name}`);
      await copyFile(source, path.join(directory, file.name));
      files.push(file);
    }
  }
  const checksums = path.join(directory, "SHA256SUMS.txt");
  await writeFile(
    checksums,
    files.map((file) => `${file.sha256}  ${file.name}\n`).join(""),
  );
  files.push({
    name: "SHA256SUMS.txt",
    sha256: await digest(checksums),
    size: (await stat(checksums)).size,
  });
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({ version, sha, files }, null, 2),
  );
  await summary(
    `Verified all three platform builds and prepared combined checksums for ${tag}.`,
  );
} else if (command === "publish") {
  if (process.env.GITHUB_REF !== "refs/heads/master")
    throw new Error("Only master can publish releases.");
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  if (
    manifest.version !== version ||
    manifest.sha !== sha ||
    manifest.files.length !== names.length ||
    manifest.files.some((f, i) => f.name !== names[i])
  )
    throw new Error(
      "Artifact manifest does not match this version, commit and download set.",
    );
  for (const file of manifest.files)
    if (
      (await stat(path.join(directory, file.name))).size !== file.size ||
      (await digest(path.join(directory, file.name))) !== file.sha256
    )
      throw new Error(`Artifact checksum mismatch: ${file.name}`);
  let { release, published } = await releaseState();
  if (published) {
    await summary(`${tag} is already public; leaving it unchanged.`);
  } else {
    const body =
      (batchVersion
        ? "Published with the owner's batch approval of 17 September 2026. The historical iteration notes below describe the original scope; 0.4 remains unapproved.\n\n"
        : "") +
      notes.replace(
        /\]\((\.\.?\/[^)]+)\)/g,
        (_, href) =>
          `](${new URL(href, `https://github.com/${repo}/blob/${sha}/docs/releases/${version}.md`)})`,
      ) +
      `\n\nBuilt from commit ${sha} by the [Desktop release workflow](https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}). Existing application checks and the packaged desktop smoke check passed before publication.\n`;
    release ||= await request("releases", {
      method: "POST",
      body: {
        tag_name: tag,
        target_commitish: sha,
        name: `LMBook ${version}`,
        body,
        draft: true,
        prerelease: false,
      },
    });
    if (release.assets.some((asset) => !names.includes(asset.name)))
      throw new Error(
        "Unexpected files in the draft release; inspect it before retrying.",
      );
    for (const file of manifest.files) {
      const existing = release.assets.find((asset) => asset.name === file.name);
      if (
        existing?.state === "uploaded" &&
        existing.digest === `sha256:${file.sha256}` &&
        existing.size === file.size
      )
        continue;
      // Only our unpublished draft is repairable; published assets are immutable here.
      if (existing)
        await request(`releases/assets/${existing.id}`, { method: "DELETE" });
      const response = await fetch(
        `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "Content-Type": !file.name.endsWith(".txt")
              ? "application/octet-stream"
              : "text/plain",
            "Content-Length": String(file.size),
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: createReadStream(path.join(directory, file.name)),
          duplex: "half",
          signal: AbortSignal.timeout(300000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Uploading ${file.name} failed (${response.status}); release remains a draft.`,
        );
      const uploaded = await response.json();
      if (
        uploaded.state !== "uploaded" ||
        uploaded.size !== file.size ||
        uploaded.digest !== `sha256:${file.sha256}`
      )
        throw new Error(
          `GitHub could not verify ${file.name}; release remains a draft.`,
        );
    }
    const assets = await request(`releases/${release.id}/assets?per_page=100`);
    if (
      assets.length !== names.length ||
      !manifest.files.every((file) =>
        assets.some(
          (a) =>
            a.name === file.name &&
            a.state === "uploaded" &&
            a.size === file.size &&
            a.digest === `sha256:${file.sha256}`,
        ),
      )
    )
      throw new Error(
        "The draft's uploaded files are incomplete or differ from the checked build.",
      );
    // 'legacy' selects Latest by version, avoiding an older queued run replacing it.
    release = await request(`releases/${release.id}`, {
      method: "PATCH",
      body: {
        draft: false,
        body,
        make_latest: batchVersion
          ? version === "0.3.16"
            ? "true"
            : "false"
          : "legacy",
      },
    });
    await summary(
      `Published [${tag}](${release.html_url}) with all seven verified downloads.`,
    );
  }
} else {
  throw new Error(
    "Usage: node scripts/release.mjs plan|stage <target>|collect|publish",
  );
}
