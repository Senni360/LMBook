import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPlaybackPosition,
  clearPlaybackPosition,
  playbackStorageKey,
  readPlaybackPosition,
  writePlaybackPosition,
  type PlaybackStorage,
} from "../shared/playback.ts";

function memoryStorage(
  initial: Record<string, string> = {},
): PlaybackStorage & {
  values: Record<string, string>;
} {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
    removeItem: (key) => {
      delete values[key];
    },
  };
}

test("resume keys isolate episode and chapter IDs", () => {
  const first = playbackStorageKey("episode/one", "chapter:one");
  const second = playbackStorageKey("episode/one", "chapter:two");
  assert.notEqual(first, second);
  assert.ok(first.includes("episode%2Fone"));
  assert.ok(first.includes("chapter%3Aone"));
});

test("resume helpers round-trip valid positions and ignore bad storage values", () => {
  const storage = memoryStorage({ bad: "not-a-number", negative: "-3" });
  const key = playbackStorageKey("e", "c");
  assert.equal(readPlaybackPosition(storage, "bad"), null);
  assert.equal(readPlaybackPosition(storage, "negative"), null);
  assert.equal(writePlaybackPosition(storage, key, 42.75), true);
  assert.equal(readPlaybackPosition(storage, key), 42.75);
  assert.equal(writePlaybackPosition(storage, key, Number.NaN), false);
  assert.equal(clearPlaybackPosition(storage, key), true);
  assert.equal(readPlaybackPosition(storage, key), null);
});

test("resume helpers contain storage failures and clamp restored media positions", () => {
  const broken: PlaybackStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readPlaybackPosition(broken, "key"), null);
  assert.equal(writePlaybackPosition(broken, "key", 3), false);
  assert.equal(clearPlaybackPosition(broken, "key"), false);
  assert.equal(clampPlaybackPosition(95, 90), 90);
  assert.equal(clampPlaybackPosition(-1, 90), 0);
  assert.equal(clampPlaybackPosition(12, Infinity), 12);
});
