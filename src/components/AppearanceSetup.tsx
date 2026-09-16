import { useEffect, useState, type CSSProperties } from "react";
import {
  APPEARANCE_ACCENTS,
  APPEARANCE_MODES,
  applyAppearance,
  initializeAppearance,
  saveAppearance,
  type AppearanceAccent,
  type AppearanceMode,
  type AppearancePreferences,
} from "../appearance";

export function AppearanceSetup() {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() =>
    initializeAppearance(),
  );

  useEffect(() => {
    applyAppearance(preferences);
  }, [preferences]);

  const update = <K extends keyof AppearancePreferences>(
    key: K,
    value: AppearancePreferences[K],
  ) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    saveAppearance(next);
  };

  return (
    <div className="appearance-setup" aria-labelledby="appearance-title">
      <div className="appearance-intro">
        <h3 id="appearance-title">Reading appearance</h3>
        <p>
          Keep the Ink workspace comfortable in bright rooms and after dark.
        </p>
      </div>
      <fieldset className="appearance-group">
        <legend>Light or dark paper</legend>
        <div
          className="appearance-mode-grid"
          role="radiogroup"
          aria-label="Color mode"
        >
          {APPEARANCE_MODES.map((mode) => (
            <label className="appearance-choice" key={mode.id}>
              <input
                type="radio"
                name="lmbook-appearance-mode"
                value={mode.id}
                checked={preferences.mode === mode.id}
                onChange={() => update("mode", mode.id as AppearanceMode)}
              />
              <span className="appearance-choice-copy">
                <strong>{mode.label}</strong>
                <small>{mode.note}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="appearance-group">
        <legend>Pen accent</legend>
        <div
          className="appearance-accent-grid"
          role="radiogroup"
          aria-label="Pen accent"
        >
          {APPEARANCE_ACCENTS.map((accent) => (
            <label
              className="appearance-accent-choice"
              key={accent.id}
              title={accent.note}
            >
              <input
                type="radio"
                name="lmbook-appearance-accent"
                value={accent.id}
                checked={preferences.accent === accent.id}
                onChange={() => update("accent", accent.id as AppearanceAccent)}
              />
              <span
                className="appearance-swatch"
                style={{ "--swatch": accent.color } as CSSProperties}
              />
              <span>{accent.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
