export type AppearanceMode = "light" | "dark" | "system";
export type AppearanceAccent = "cobalt" | "moss" | "amber" | "plum" | "coral";

export interface AppearancePreferences {
  mode: AppearanceMode;
  accent: AppearanceAccent;
}

export const APPEARANCE_STORAGE_KEY = "lmbook-appearance";
const modes: AppearanceMode[] = ["light", "dark", "system"];
const accents: AppearanceAccent[] = [
  "cobalt",
  "moss",
  "amber",
  "plum",
  "coral",
];

const isMode = (value: unknown): value is AppearanceMode =>
  typeof value === "string" && modes.includes(value as AppearanceMode);
const isAccent = (value: unknown): value is AppearanceAccent =>
  typeof value === "string" && accents.includes(value as AppearanceAccent);

export function readAppearance(): AppearancePreferences {
  const fallback: AppearancePreferences = { mode: "system", accent: "cobalt" };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(APPEARANCE_STORAGE_KEY) || "null",
    );
    if (!saved || typeof saved !== "object") return fallback;
    const record = saved as Record<string, unknown>;
    return {
      mode: isMode(record.mode) ? record.mode : fallback.mode,
      accent: isAccent(record.accent) ? record.accent : fallback.accent,
    };
  } catch {
    return fallback;
  }
}

function prefersDark(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function applyAppearance(preferences: AppearancePreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved =
    preferences.mode === "system"
      ? prefersDark()
        ? "dark"
        : "light"
      : preferences.mode;
  // Keep the established Ink theme enabled while appearance controls its palette.
  root.dataset.theme = "ink";
  root.dataset.appearanceMode = preferences.mode;
  root.dataset.appearanceAccent = preferences.accent;
  root.dataset.colorScheme = resolved;
  root.style.colorScheme = resolved;
}

export function saveAppearance(preferences: AppearancePreferences): void {
  applyAppearance(preferences);
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing and locked-down webviews can reject local storage.
  }
}

let initialized = false;
let mediaQuery: MediaQueryList | undefined;
const onSystemThemeChange = () => {
  const preferences = readAppearance();
  if (preferences.mode === "system") applyAppearance(preferences);
};

/** Apply saved appearance before the first React render. Safe to call more than once. */
export function initializeAppearance(): AppearancePreferences {
  const preferences = readAppearance();
  applyAppearance(preferences);
  if (!initialized && typeof matchMedia === "function") {
    initialized = true;
    mediaQuery = matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener?.("change", onSystemThemeChange);
  }
  return preferences;
}

export const APPEARANCE_MODES: ReadonlyArray<{
  id: AppearanceMode;
  label: string;
  note: string;
}> = [
  { id: "light", label: "Light", note: "Paper and daylight" },
  { id: "dark", label: "Dark", note: "Quiet for evening reading" },
  { id: "system", label: "System", note: "Follow your device" },
];

export const APPEARANCE_ACCENTS: ReadonlyArray<{
  id: AppearanceAccent;
  label: string;
  color: string;
  note: string;
}> = [
  { id: "cobalt", label: "Cobalt", color: "#2346d8", note: "The original pen" },
  { id: "moss", label: "Moss", color: "#2f7659", note: "Grounded and gentle" },
  { id: "amber", label: "Amber", color: "#a36b00", note: "Warm highlighter" },
  { id: "plum", label: "Plum", color: "#7b3f78", note: "Thoughtful and quiet" },
  { id: "coral", label: "Coral", color: "#b34f46", note: "Bright source mark" },
];
