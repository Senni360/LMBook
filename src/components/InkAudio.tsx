import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from "react";
import { LoaderCircle, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { InkButton } from "./InkControl";

function time(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

/** Keep one real media element: chapter seeking, resume and source timestamps use its ref. */
export function InkAudio({
  ref,
  className = "",
  controls: _controls,
  ...props
}: ComponentPropsWithRef<"audio">) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState({
    playing: false,
    waiting: false,
    current: 0,
    duration: 0,
    muted: false,
    volume: 1,
  });
  const [error, setError] = useState("");
  const attach = useCallback(
    (element: HTMLAudioElement | null) => {
      audio.current = element;
      if (typeof ref === "function") return ref(element);
      if (ref) ref.current = element;
    },
    [ref],
  );
  useEffect(() => {
    const media = audio.current!;
    const update = (event?: Event) => {
      if (event?.type === "loadstart" || event?.type === "playing")
        setError("");
      setState({
        playing: !media.paused && !media.ended,
        waiting: !media.paused && media.readyState < 3,
        current: media.currentTime,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        muted: media.muted,
        volume: media.volume,
      });
    };
    const events = [
      "play",
      "pause",
      "playing",
      "waiting",
      "timeupdate",
      "durationchange",
      "volumechange",
      "ended",
      "emptied",
      "loadedmetadata",
      "loadstart",
      "error",
    ];
    events.forEach((name) => media.addEventListener(name, update));
    update();
    return () =>
      events.forEach((name) => media.removeEventListener(name, update));
  }, []);
  const toggle = async () => {
    const media = audio.current!;
    if (!media.paused) {
      media.pause();
      return;
    }
    try {
      await media.play();
      setError("");
    } catch {
      setError("Audio could not play. Try again once it has loaded.");
    }
  };
  return (
    <div
      className={`ink-audio ${className}`}
      role="group"
      aria-label={props["aria-label"] || "Audio player"}
    >
      <audio {...props} ref={attach} />
      <InkButton
        type="button"
        className="icon-button ink-audio-play"
        aria-label={state.playing ? "Pause audio" : "Play audio"}
        onClick={() => void toggle()}
      >
        {state.waiting ? (
          <LoaderCircle size={19} className="spin" />
        ) : state.playing ? (
          <Pause size={19} />
        ) : (
          <Play size={19} />
        )}
      </InkButton>
      <span className="ink-audio-time" aria-hidden="true">
        {time(state.current)}
      </span>
      <input
        type="range"
        className="ink-audio-seek"
        min={0}
        max={state.duration || 1}
        step={0.1}
        value={Math.min(state.current, state.duration)}
        disabled={!state.duration}
        aria-label="Audio position"
        aria-valuetext={`${time(state.current)} of ${time(state.duration)}`}
        style={
          {
            "--audio-progress": `${state.duration ? (state.current / state.duration) * 100 : 0}%`,
          } as React.CSSProperties
        }
        onChange={(event) => {
          const current = Number(event.target.value);
          audio.current!.currentTime = current;
          setState((value) => ({ ...value, current }));
        }}
      />
      <span className="ink-audio-time" aria-hidden="true">
        {time(state.duration)}
      </span>
      <InkButton
        type="button"
        className="icon-button ink-audio-mute"
        aria-label={state.muted ? "Unmute audio" : "Mute audio"}
        onClick={() => {
          audio.current!.muted = !state.muted;
        }}
      >
        {state.muted || state.volume === 0 ? (
          <VolumeX size={18} />
        ) : (
          <Volume2 size={18} />
        )}
      </InkButton>
      <input
        className="ink-audio-volume"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={state.muted ? 0 : state.volume}
        aria-label="Audio volume"
        onChange={(event) => {
          const volume = Number(event.target.value);
          audio.current!.muted = false;
          audio.current!.volume = volume;
          setState((value) => ({ ...value, muted: false, volume }));
        }}
      />
      {error && (
        <span className="ink-audio-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
