import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "./store.ts";

const preferencesSchema = z.object({
  googleProject: z
    .string()
    .trim()
    .regex(
      /^$|^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
      "Use the Google Cloud project ID, for example sennibook-study-123.",
    )
    .optional(),
});
const filename = path.join(dataDir, "preferences.json");
export function getPreferences() {
  if (!existsSync(filename)) return {} as z.infer<typeof preferencesSchema>;
  return preferencesSchema.parse(JSON.parse(readFileSync(filename, "utf8")));
}
export function googleProject() {
  return (
    getPreferences().googleProject ?? process.env.GOOGLE_CLOUD_PROJECT ?? ""
  );
}
export function savePreferences(input: unknown) {
  const next = preferencesSchema.parse(input);
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(temporary, filename);
  return { googleProject: googleProject() };
}
