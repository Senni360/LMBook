import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

/** Resolve a POSIX CLI without invoking a shell or searching the working directory. */
export function executableOnPath(name: string) {
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Continue to the next installed location.
    }
  }
  return "";
}
