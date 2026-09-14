import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

/** Stop the process we launched and its Windows descendants (CLI launchers spawn children). */
export function stopProcess(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }
  const taskkill = path.join(
    process.env.SYSTEMROOT || "C:\\Windows",
    "System32",
    "taskkill.exe",
  );
  const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], {
    windowsHide: true,
    shell: false,
    stdio: "ignore",
  });
  killer.once("error", () => child.kill());
  killer.once("close", (code) => {
    if (code !== 0) child.kill();
  });
}
