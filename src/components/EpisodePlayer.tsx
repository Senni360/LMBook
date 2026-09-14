import { PlaybackMark } from "./Motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DownloadLink } from "./Downloads";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Rewind,
  FastForward,
} from "lucide-react";
import type { Episode } from "../../shared/model";
import {
  clampPlaybackPosition,
  clearPlaybackPosition,
  playbackStorageKey,
  readPlaybackPosition,
  writePlaybackPosition,
  type PlaybackStorage,
} from "../../shared/playback";
import "./episode-player.css";

export type EpisodePlayerProps = {
  episode: Episode;
  activeChapterId: string;
  onChapterChange: (id: string) => void;
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SPEED_KEY = "sennibook:playback-speed";

function getStorage(): PlaybackStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function chapterFileUrl(file: string): string {
  return `/api/audio/${encodeURIComponent(file)}`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

function persistAudioPosition(
  storage: PlaybackStorage | null,
  key: string,
  audio: HTMLAudioElement,
) {
  if (audio.ended) {
    clearPlaybackPosition(storage, key);
    return;
  }
  writePlaybackPosition(storage, key, audio.currentTime);
}

export function EpisodePlayer({
  episode,
  activeChapterId,
  onChapterChange,
}: EpisodePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sourceKeyRef = useRef<string | null>(null);
  const lastPersistedAt = useRef(0);
  const continuePlayback = useRef(false);
  const changingSource = useRef(false);
  const [speed, setSpeed] = useState(() => {
    try {
      const saved = Number(getStorage()?.getItem(SPEED_KEY));
      return SPEEDS.includes(saved) ? saved : 1;
    } catch {
      return 1;
    }
  });
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const activeChapter =
    episode.chapters.find((chapter) => chapter.id === activeChapterId) ||
    episode.chapters[0];
  const activeIndex = activeChapter
    ? episode.chapters.findIndex((chapter) => chapter.id === activeChapter.id)
    : -1;
  const previousChapter =
    activeIndex > 0 ? episode.chapters[activeIndex - 1] : undefined;
  const nextChapter =
    activeIndex >= 0 ? episode.chapters[activeIndex + 1] : undefined;
  const storage = useMemo(() => getStorage(), []);
  const key = activeChapter
    ? playbackStorageKey(episode.id, activeChapter.id)
    : null;
  useEffect(() => setPlaying(false), [key, activeChapter?.audioFile]);
  const activeSource = activeChapter?.audioFile
    ? chapterFileUrl(activeChapter.audioFile)
    : null;

  const persistPosition = useCallback(
    (force = false) => {
      const audio = audioRef.current;
      if (!audio || !sourceKeyRef.current || changingSource.current) return;
      if (audio.ended) {
        clearPlaybackPosition(storage, sourceKeyRef.current);
        return;
      }
      const now = Date.now();
      if (!force && now - lastPersistedAt.current < 750) return;
      if (
        writePlaybackPosition(storage, sourceKeyRef.current, audio.currentTime)
      )
        lastPersistedAt.current = now;
    },
    [storage],
  );

  const seekBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || audio.readyState === 0) return;
    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : Infinity;
    audio.currentTime = clampPlaybackPosition(
      audio.currentTime + seconds,
      duration,
    );
  }, []);

  const reportPlayError = useCallback((error: unknown) => {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";
    setPlaybackError(
      name === "NotAllowedError"
        ? "Playback is ready. Tap Play to continue."
        : "Audio could not start. Try again.",
    );
  }, []);

  const playAudio = useCallback(
    (audio = audioRef.current) => {
      if (!audio) return;
      void audio.play().catch(reportPlayError);
    },
    [reportPlayError],
  );

  const retryPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaybackError(null);
    if (audio.error) {
      // Reload only broken media; a blocked Play should retain its position.
      persistPosition(true);
      const position = audio.currentTime;
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = clampPlaybackPosition(position, audio.duration);
        },
        { once: true },
      );
      audio.load();
    }
    playAudio(audio);
  }, [playAudio, persistPosition]);

  const changeChapter = useCallback(
    (chapterId: string, play = false) => {
      if (!episode.chapters.some((chapter) => chapter.id === chapterId)) return;
      const audio = audioRef.current;
      continuePlayback.current =
        play || Boolean(audio && !audio.paused && !audio.ended);
      persistPosition(true);
      onChapterChange(chapterId);
    },
    [episode.chapters, onChapterChange, persistPosition],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !key) {
      if (!audio) sourceKeyRef.current = null;
      continuePlayback.current = false;
      changingSource.current = false;
      return;
    }
    const absoluteSource = activeSource
      ? new URL(activeSource, window.location.href).href
      : "";
    if (sourceKeyRef.current === key && audio.src === absoluteSource) return;

    continuePlayback.current ||= !audio.paused && !audio.ended;
    persistPosition(true);
    changingSource.current = true;
    setPlaybackError(null);
    sourceKeyRef.current = key;
    lastPersistedAt.current = 0;
    audio.pause();
    audio.playbackRate = speedRef.current;
    audio.src = activeSource || "";
    if (!activeSource) return;
    const restore = () => {
      const saved = readPlaybackPosition(storage, key);
      if (saved !== null)
        audio.currentTime = clampPlaybackPosition(saved, audio.duration);
      changingSource.current = false;
      if (continuePlayback.current) {
        continuePlayback.current = false;
        playAudio(audio);
      }
    };
    audio.addEventListener("loadedmetadata", restore, { once: true });
    audio.load();
    return () => {
      audio.removeEventListener("loadedmetadata", restore);
      if (!changingSource.current && sourceKeyRef.current === key)
        persistAudioPosition(storage, key, audio);
    };
  }, [activeSource, key, persistPosition, playAudio, storage]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
    try {
      storage?.setItem(SPEED_KEY, String(speed));
    } catch {
      // The current speed still works if this device cannot save preferences.
    }
  }, [speed, storage]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onBeforeUnload = () => persistPosition(true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      persistPosition(true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [persistPosition]);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !activeChapter
    )
      return;
    const mediaSession = navigator.mediaSession;
    if (typeof MediaMetadata !== "undefined")
      mediaSession.metadata = new MediaMetadata({
        title: activeChapter.title,
        artist: "LMBook",
        album: episode.title,
      });
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => playAudio()],
      ["pause", () => audioRef.current?.pause()],
      ["seekbackward", () => seekBy(-15)],
      ["seekforward", () => seekBy(15)],
      [
        "previoustrack",
        () => previousChapter && changeChapter(previousChapter.id),
      ],
      [
        "nexttrack",
        () =>
          nextChapter && changeChapter(nextChapter.id, !!nextChapter.audioFile),
      ],
    ];
    for (const [action, handler] of actions) {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Individual actions are optional across browsers and Electron versions.
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore unsupported cleanup actions.
        }
      }
    };
  }, [
    activeChapter,
    changeChapter,
    episode.title,
    nextChapter,
    playAudio,
    previousChapter,
    seekBy,
  ]);

  if (!activeChapter) return null;
  const hasAudio = Boolean(activeChapter.audioFile);
  return (
    <section className="episode-player" aria-label="Episode player">
      <div className="episode-player-heading">
        <div>
          <PlaybackMark playing={playing} />
          <strong key={activeChapter.id}>{activeChapter.title}</strong>
        </div>
        <label className="episode-player-speed">
          <span>Speed</span>
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
      </div>
      {hasAudio ? (
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          aria-label={`Audio for ${activeChapter.title}`}
          onCanPlay={() => setPlaybackError(null)}
          onPlay={() => setPlaybackError(null)}
          onPlaying={() => setPlaying(true)}
          onWaiting={() => setPlaying(false)}
          onEmptied={() => setPlaying(false)}
          onError={() => {
            setPlaying(false);
            setPlaybackError(
              "Audio could not load. Check the chapter audio and try again.",
            );
          }}
          onTimeUpdate={() => persistPosition()}
          onPause={() => {
            setPlaying(false);
            persistPosition(true);
          }}
          onEnded={() => {
            setPlaying(false);
            if (key) clearPlaybackPosition(storage, key);
            if (nextChapter)
              changeChapter(nextChapter.id, !!nextChapter.audioFile);
          }}
        />
      ) : (
        <p className="episode-player-empty">
          Audio is not available for this chapter yet.
        </p>
      )}
      {playbackError && hasAudio && (
        <div className="episode-player-error" role="alert">
          <span>{playbackError}</span>
          <button type="button" onClick={retryPlayback}>
            Retry playback
          </button>
        </div>
      )}
      <div className="episode-player-controls">
        <button
          type="button"
          className="episode-player-button"
          aria-label={
            previousChapter
              ? `Previous chapter: ${previousChapter.title}`
              : "No previous chapter"
          }
          title={
            previousChapter
              ? `Previous chapter: ${previousChapter.title}`
              : "No previous chapter"
          }
          disabled={!previousChapter}
          onClick={() => previousChapter && changeChapter(previousChapter.id)}
        >
          <ChevronLeft size={17} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          className="episode-player-button"
          aria-label="Back 15 seconds"
          title="Back 15 seconds"
          disabled={!hasAudio}
          onClick={() => seekBy(-15)}
        >
          <Rewind size={17} aria-hidden="true" />
          15 sec
        </button>
        <button
          type="button"
          className="episode-player-button"
          aria-label="Forward 15 seconds"
          title="Forward 15 seconds"
          disabled={!hasAudio}
          onClick={() => seekBy(15)}
        >
          15 sec
          <FastForward size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="episode-player-button"
          aria-label={
            nextChapter
              ? `Next chapter: ${nextChapter.title}`
              : "No next chapter"
          }
          title={
            nextChapter
              ? `Next chapter: ${nextChapter.title}`
              : "No next chapter"
          }
          disabled={!nextChapter}
          onClick={() => nextChapter && changeChapter(nextChapter.id)}
        >
          Next
          <ChevronRight size={17} aria-hidden="true" />
        </button>
        {activeChapter.audioFile && (
          <DownloadLink
            className="episode-player-download"
            href={chapterFileUrl(activeChapter.audioFile)}
            filename={`${activeChapter.title}.wav`}
            download
          >
            <Download size={16} aria-hidden="true" />
            Download chapter
          </DownloadLink>
        )}
      </div>
      <label className="episode-player-chapter">
        <span>Chapter</span>
        <select
          aria-label="Choose chapter"
          value={activeChapter.id}
          onChange={(event) => changeChapter(event.target.value)}
        >
          {episode.chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title}
              {chapter.audioFile ? "" : " · audio pending"}
            </option>
          ))}
        </select>
      </label>
      <span className="sr-only">
        Current position is saved for this episode and chapter.
      </span>
    </section>
  );
}

export { formatTime };
