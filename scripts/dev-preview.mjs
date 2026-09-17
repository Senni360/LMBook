import { createServer } from "vite";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import electron from "electron";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5190, strictPort: true },
});
await server.listen();
let child,
  stopped = false,
  restarting = false,
  timer;
const watchers = [];
function launch() {
  const env = {
    ...process.env,
    LMBOOK_PREVIEW_URL: "http://127.0.0.1:5190/?ux-lab=11&desktop-preview=1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, ["electron/preview.cjs"], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: false,
  });
  child.on("error", (error) => {
    console.error(error.message);
    void stop();
  });
  child.on("exit", () => {
    if (restarting && !stopped) {
      restarting = false;
      launch();
    } else void stop();
  });
}
async function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  watchers.forEach((watcher) => watcher.close());
  child?.kill();
  await server.close();
}
for (const file of ["electron/preview.cjs", "electron/preload.cjs"]) {
  watchers.push(
    watch(new URL(`../${file}`, import.meta.url), () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!stopped && !restarting) {
          restarting = true;
          child?.kill();
        }
      }, 250);
    }),
  );
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(
  "LMBook live preview: renderer edits update automatically. Close the window to stop.\nPreview data is separate from your library.",
);
launch();
