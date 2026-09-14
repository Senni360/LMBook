import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const codexPath =
  process.env.CODEX_CLI_PATH ||
  path.join(
    process.env.APPDATA || "",
    "npm",
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js",
  );

/** Launch the installed native binary ourselves: the npm wrapper opens a console on Windows. */
export function codexCommand() {
  if (!existsSync(codexPath)) return null;
  if (!/\.[cm]?js$/i.test(codexPath))
    return { file: codexPath, prefix: [] as string[] };
  const target =
    process.platform === "win32"
      ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`
      : "";
  if (target) {
    const packageName = `@openai/codex-win32-${process.arch}`;
    const roots = [path.resolve(codexPath, "..", "..", "vendor")];
    try {
      const resolve = createRequire(path.resolve(codexPath));
      roots.unshift(
        path.join(
          path.dirname(resolve.resolve(`${packageName}/package.json`)),
          "vendor",
        ),
      );
    } catch {
      /* Older CLI packages keep vendor files beside their launcher. */
    }
    for (const root of roots) {
      for (const folder of ["bin", "codex"]) {
        const file = path.join(root, target, folder, "codex.exe");
        if (existsSync(file)) return { file, prefix: [] as string[] };
      }
    }
    return null;
  }
  return {
    file: process.env.SENNIBOOK_NODE_EXEC || process.execPath,
    prefix: [codexPath],
  };
}

export function codexFailure(diagnostic: string, code: number | null) {
  // Never expose a transcript, reasoning, or credential-bearing raw log in the UI.
  const clean = diagnostic.replace(/\u001b\[[0-9;]*m/g, "");
  if (/usage limit|rate limit|quota|429|credits? exhausted/i.test(clean))
    return "Codex reached its usage limit. Wait for the limit to reset or select another writing provider in Settings.";
  if (
    /not logged in|authentication failed|unauthorized|token.*expired|401|please.*log.?in/i.test(
      clean,
    )
  )
    return "Codex needs a valid login. Run codex login, then use Check Codex connection in Settings.";
  if (
    /unexpected argument|unrecognized (?:option|argument)|unknown flag/i.test(
      clean,
    )
  )
    return "The installed Codex CLI does not support the required options. Update the CLI, then restart SenniBook.";
  if (
    /model.*(?:not found|not supported|does not exist|not available)/i.test(
      clean,
    )
  )
    return "The selected Codex model is unavailable. Clear the notebook Model ID in Settings or choose a model your account can access.";
  if (/sandbox|spawn.*(?:failed|denied)|access is denied/i.test(clean))
    return "Codex could not start its local process or sandbox. Check the CLI installation and Windows permissions, then restart SenniBook.";
  if (/connection|network|timed? out|dns|tls|certificate/i.test(clean))
    return "Codex could not reach its service. Check your connection, then retry.";
  return `Codex stopped before returning an answer (exit ${code ?? "unknown"}). Check codex login status and your model allowance, or select another writing provider in Settings.`;
}
