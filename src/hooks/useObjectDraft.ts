import { useDraftText } from "./useDraftText";

/** Store only edited fields so a draft never reverts unrelated saved settings. */
export function useObjectDraft<T extends object>(
  key: string,
  saved: T,
  fields: readonly (keyof T)[],
) {
  const storage = useDraftText(key, "{}", 150_000);
  let patch: Partial<T> = {};
  let error = storage.storageError;
  try {
    const value: unknown = JSON.parse(storage.text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid form draft");
    const entries = Object.entries(value).filter(([field]) =>
      fields.includes(field as keyof T),
    );
    if (
      entries.some(
        ([field, value]) =>
          typeof value !== typeof saved[field as keyof T] ||
          (typeof value === "number" && !Number.isFinite(value)),
      )
    )
      throw new Error("Invalid form draft");
    patch = Object.fromEntries(entries) as Partial<T>;
  } catch {
    error =
      "This form draft could not be restored. Your saved values are shown; discard the draft to start again.";
  }
  const value = { ...saved, ...patch };
  const changed = fields.some((field) => value[field] !== saved[field]);
  const setValue = (next: T) => {
    storage.setText(
      JSON.stringify(
        Object.fromEntries(
          fields
            .filter((field) => next[field] !== saved[field])
            .map((field) => [field, next[field]]),
        ),
      ),
    );
  };
  return {
    value,
    setValue,
    changed,
    error,
    restored: storage.restored && changed,
    discard: storage.discard,
    // Capture the exact submitted draft; a late save must retain newer edits.
    accept: () => storage.accept(storage.text, "{}"),
  };
}
