import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checkout = project;
try {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: project, encoding: "utf8", windowsHide: true }).trim();
  checkout = path.dirname(path.resolve(project, common));
} catch { /* Source archives package beside their source directory. */ }
const { version } = JSON.parse(readFileSync(path.join(project, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("A release needs a stable version number.");
const output = path.join(checkout, "release", version);
const args = process.argv.slice(2);
if (args.some(arg => /directories\.output|--config(?:=|$)|^-c(?:=|$)|--publish|^-p(?:=|$)/.test(arg))) throw new Error("Desktop packages must stay local in the normal release/<version> folder.");
const require = createRequire(import.meta.url);
console.log(`Packaging LMBook ${version} in ${output}`);
const child = spawn(process.execPath, [require.resolve("electron-builder/cli.js"), ...args, "--publish", "never", `--config.directories.output=${output}`], { cwd: project, stdio: "inherit", windowsHide: true });
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
