export type PlaybackStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function playbackStorageKey(
  episodeId: string,
  chapterId: string,
): string {
  return `sennibook:resume:${encodeURIComponent(episodeId)}:${encodeURIComponent(chapterId)}`;
}

export function readPlaybackPosition(
  storage: PlaybackStorage | null | undefined,
  key: string,
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export function writePlaybackPosition(
  storage: PlaybackStorage | null | undefined,
  key: string,
  seconds: number,
): boolean {
  if (!storage || !Number.isFinite(seconds) || seconds < 0) return false;
  try {
    storage.setItem(key, String(seconds));
    return true;
  } catch {
    return false;
  }
}

export function clearPlaybackPosition(
  storage: PlaybackStorage | null | undefined,
  key: string,
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clampPlaybackPosition(
  seconds: number,
  duration: number,
): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  if (!Number.isFinite(duration) || duration < 0) return seconds;
  return Math.min(seconds, duration);
}
