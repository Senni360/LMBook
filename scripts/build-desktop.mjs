import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: "server-dist/index.js",
  sourcemap: true,
});
await copyFile("server/ocr-worker.cjs", "server-dist/ocr-worker.cjs");
