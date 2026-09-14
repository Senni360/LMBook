import { useEffect, useRef, useState } from "react";
import type { Settings } from "../../shared/model";
import type { CartesiaVoice, CartesiaVoicePage } from "../../shared/speech";
import "./cartesia.css";

export function SpeechSettings({
  value,
  onChange,
  disabled,
  connected,
}: {
  value: Settings;
  onChange: (settings: Settings) => void;
  disabled: boolean;
  connected: boolean;
}) {
  const [voices, setVoices] = useState<CartesiaVoice[]>([]);
  const knownVoices = useRef(new Map<string, CartesiaVoice>());
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const cartesia = value.ttsProvider === "cartesia";
  async function load(next?: string, signal?: AbortSignal) {
    const version = generation.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        language: value.language,
        query: search.trim(),
      });
      if (next) query.set("cursor", next);
      const response = await fetch(`/api/cartesia/voices?${query}`, { signal });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not load Cartesia voices.");
      if (version !== generation.current || signal?.aborted) return;
      const page = result as CartesiaVoicePage;
      page.voices.forEach((voice) => knownVoices.current.set(voice.id, voice));
      setVoices((previous) => [
        ...new Map(
          [...(next ? previous : []), ...page.voices].map((v) => [v.id, v]),
        ).values(),
      ]);
      setCursor(page.nextPage);
    } catch (reason) {
      if (version === generation.current && !signal?.aborted)
        setError((reason as Error).message);
    } finally {
      if (version === generation.current && !signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    generation.current++;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setVoices([]);
    setCursor(null);
    setError("");
    setLoading(cartesia && connected);
    const timer =
      cartesia && connected
        ? setTimeout(() => void load(undefined, controller.signal), 250)
        : undefined;
    return () => {
      clearTimeout(timer);
      controller.abort();
      generation.current++;
    };
  }, [cartesia, connected, value.language, search, reload]);
  const update = <K extends keyof Settings>(key: K, next: Settings[K]) =>
    onChange({ ...value, [key]: next });
  const selectedName = (id: string) =>
    knownVoices.current.get(id)?.name || `Selected voice · ${id.slice(0, 8)}`;
  return (
    <div className="speech-settings-fields">
      <label className="field">
        <span>Speech provider</span>
        <select
          aria-label="Speech provider"
          value={value.ttsProvider || "google"}
          disabled={disabled}
          onChange={(event) =>
            update("ttsProvider", event.target.value as Settings["ttsProvider"])
          }
        >
          <option value="google">Google Cloud</option>
          <option value="cartesia">Cartesia · Sonic 3.6</option>
        </select>
      </label>
      {cartesia ? (
        <>
          {!connected && (
            <p className="inline-error">
              Connect your Cartesia account in Settings to browse voices.
            </p>
          )}
          {connected && (
            <>
              <label className="field">
                <span>Find a voice</span>
                <input
                  aria-label="Find a voice"
                  type="search"
                  value={search}
                  maxLength={150}
                  disabled={disabled}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or description"
                />
              </label>
              <p className="fine-print">
                Voices for {value.language === "nl" ? "Dutch" : "English"}.
                Loading voices uses no speech credits.
              </p>
            </>
          )}
          {(["cartesiaVoiceA", "cartesiaVoiceB"] as const).map((key, index) => (
            <label className="field" key={key}>
              <span>Host {index ? "B" : "A"}</span>
              <select
                aria-label={`Host ${index ? "B" : "A"}`}
                value={value[key] || ""}
                disabled={disabled || !connected}
                onChange={(event) => update(key, event.target.value)}
              >
                <option value="">Choose a voice</option>
                {value[key] && !voices.some((v) => v.id === value[key]) && (
                  <option value={value[key]}>{selectedName(value[key])}</option>
                )}
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                    {voice.language ? ` · ${voice.language}` : ""}
                  </option>
                ))}
              </select>
              {knownVoices.current.get(value[key])?.description && (
                <small>
                  {knownVoices.current.get(value[key])!.description}
                </small>
              )}
            </label>
          ))}
          <div className="cartesia-actions">
            {connected && (
              <button
                type="button"
                className="button quiet"
                disabled={disabled || loading}
                onClick={() => setReload((n) => n + 1)}
              >
                Refresh voices
              </button>
            )}
            {cursor && (
              <button
                type="button"
                className="button quiet"
                disabled={disabled || loading}
                onClick={() => void load(cursor, abort.current?.signal)}
              >
                Load more
              </button>
            )}
          </div>
          {loading && (
            <p className="fine-print" role="status">
              Loading voices…
            </p>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {connected && !loading && !error && !voices.length && (
            <p className="fine-print">
              No matching voices. Try another search.
            </p>
          )}
          <label className="field">
            <span>Audio quality</span>
            <select
              aria-label="Audio quality"
              value={value.cartesiaSampleRate ?? 44100}
              disabled={disabled}
              onChange={(event) =>
                update(
                  "cartesiaSampleRate",
                  Number(event.target.value) as 24000 | 44100,
                )
              }
            >
              <option value={44100}>High · 44.1 kHz (recommended)</option>
              <option value={24000}>Standard · 24 kHz</option>
            </select>
            <small>
              Applies to newly generated audio. Existing recordings keep their
              original quality.
            </small>
          </label>
          <label className="field">
            <span>
              Delivery speed · {(value.cartesiaSpeed ?? 1).toFixed(2)}×
            </span>
            <input
              aria-label="Delivery speed"
              type="range"
              min={0.6}
              max={1.5}
              step={0.05}
              value={value.cartesiaSpeed ?? 1}
              disabled={disabled}
              onChange={(event) =>
                update("cartesiaSpeed", Number(event.target.value))
              }
            />
            <small>
              Guides the generated delivery. Playback speed can still be changed
              while listening.
            </small>
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>Speech model</span>
            <select
              aria-label="Speech model"
              value={value.ttsModel}
              disabled={disabled}
              onChange={(event) =>
                update("ttsModel", event.target.value as Settings["ttsModel"])
              }
            >
              <option value="gemini-2.5-flash-tts">Gemini 2.5 Flash TTS</option>
              <option value="gemini-3.1-flash-tts-preview">
                Gemini 3.1 Flash TTS · preview
              </option>
              <option value="gemini-2.5-pro-tts">Gemini 2.5 Pro TTS</option>
            </select>
          </label>
          <div className="form-row">
            {(["voiceA", "voiceB"] as const).map((key, index) => (
              <label className="field" key={key}>
                <span>Host {index ? "B" : "A"}</span>
                <select
                  aria-label={`Host ${index ? "B" : "A"}`}
                  value={value[key]}
                  disabled={disabled}
                  onChange={(event) =>
                    update(key, event.target.value as Settings["voiceA"])
                  }
                >
                  {[
                    "Kore",
                    "Charon",
                    "Puck",
                    "Aoede",
                    "Fenrir",
                    "Leda",
                    "Orus",
                    "Zephyr",
                  ].map((voice) => (
                    <option key={voice}>{voice}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
