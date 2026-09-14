import { useEffect, useRef, useState } from "react";
import {
  type FlashCard,
  type FlashDeck,
  cardEvidenceIssues,
} from "../../shared/flashcards";
import { useDraftText } from "../hooks/useDraftText";

type Fields = Record<string, string>;
type Save = (body: object) => Promise<void>;
type Pending = (id: string, pending: boolean) => void;
const same = (a: Fields, b: Fields) =>
  Object.keys(a).every((k) => a[k] === b[k]);

/** Keep the edit's baseline with its draft, so recovery cannot overwrite a newer edit. */
function useAutosave(
  key: string,
  saved: Fields,
  save: Save,
  onPending: Pending,
  id: string,
  disabled: boolean,
) {
  const draft = useDraftText(key, "{}", 50000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  let edit: { before: Fields; after: Fields } | undefined;
  let draftError = "";
  try {
    const parsed = JSON.parse(draft.text);
    if (
      parsed.before &&
      parsed.after &&
      [parsed.before, parsed.after].every(
        (value) =>
          Object.keys(value).length === Object.keys(saved).length &&
          Object.keys(saved).every((k) => typeof value[k] === "string"),
      )
    )
      edit = parsed;
    else if (draft.text !== "{}") throw new Error("Invalid word draft");
  } catch {
    draftError =
      "This word draft could not be restored. Use the saved version to continue.";
  }
  const value = edit?.after || saved;
  const changed = !!edit && !same(edit.before, edit.after);
  const valid = Object.entries(value).every(
    ([k, v]) => ["group", "example"].includes(k) || !!v.trim(),
  );
  const pending = changed || saving || !!draftError;
  useEffect(() => {
    onPending(id, pending);
  }, [id, pending, onPending]);
  useEffect(() => () => onPending(id, false), [id, onPending]);
  const current = useRef({ edit, save, draft });
  current.current = { edit, save, draft };
  useEffect(() => {
    if (!changed || !valid || disabled || saving || error) return;
    const timer = setTimeout(() => {
      const submitted = current.current.edit;
      if (!submitted) return;
      setSaving(true);
      void current.current
        .save(submitted)
        .then(() => {
          const latestDraft = current.current.draft;
          const latest = current.current.edit;
          if (latest && same(latest.before, submitted.before))
            latestDraft.accept(
              latestDraft.text,
              same(latest.after, submitted.after)
                ? "{}"
                : JSON.stringify({
                    before: submitted.after,
                    after: latest.after,
                  }),
            );
        })
        .catch((e) =>
          setError(
            e instanceof Error
              ? e.message
              : "Could not save. Retry when connected.",
          ),
        )
        .finally(() => setSaving(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [draft.text, changed, valid, disabled, saving, error]);
  return {
    value,
    set: (field: string, text: string) =>
      draft.setText(
        JSON.stringify({
          before: edit?.before || saved,
          after: { ...value, [field]: text },
        }),
      ),
    status: saving
      ? "Saving…"
      : changed
        ? valid
          ? "Unsaved changes"
          : "Fill in both sides to save"
        : "Saved",
    error: error || draftError || draft.storageError,
    retry: () => setError(""),
    discard: () => {
      draft.discard();
      setError("");
    },
  };
}

export function FlashWordList({
  notebookId,
  deck,
  disabled,
  change,
  onPending,
  onReview,
}: {
  notebookId: string;
  deck: FlashDeck;
  disabled: boolean;
  change: (url: string, method?: string, body?: unknown) => Promise<void>;
  onPending: Pending;
  onReview: () => void;
}) {
  const [filter, setFilter] = useState("");
  // Serialize responses so an earlier response cannot replace a later saved row.
  const queue = useRef(Promise.resolve());
  const save: Save = (body) => {
    const next = queue.current.then(() =>
      change(`/notebooks/${notebookId}/flashcards/${deck.id}`, "PATCH", body),
    );
    queue.current = next.catch(() => {});
    return next;
  };
  const labels = useAutosave(
    `${notebookId}:flashcards:${deck.id}:languages`,
    { frontLabel: deck.frontLabel, backLabel: deck.backLabel },
    (body) => save({ action: "labels", ...body }),
    onPending,
    "languages",
    disabled,
  );
  return (
    <div className="flash-word-list">
      <div className="flash-word-heading">
        <div>
          <h3>
            {deck.mode === "vocabulary"
              ? "Your word list"
              : "Your question list"}
          </h3>
          <p className="flash-help">
            Edit either side. Changes save automatically and apply in both
            practice directions.
          </p>
        </div>
        <span>
          {deck.cards.length}{" "}
          {deck.mode === "vocabulary" ? "pairs" : "questions"}
        </span>
      </div>
      <details className="flash-language-editor">
        <summary>
          {deck.frontLabel} ↔ {deck.backLabel} · Edit language labels
        </summary>
        <div className="flash-fields">
          {(["frontLabel", "backLabel"] as const).map((field, i) => (
            <label key={field}>
              Language {i + 1}
              <input
                maxLength={60}
                disabled={disabled}
                value={labels.value[field]}
                onChange={(e) => labels.set(field, e.target.value)}
              />
            </label>
          ))}
        </div>
        <SaveState edit={labels} />
      </details>
      <label>
        Find a word
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search either language or chapter"
        />
      </label>
      <ol className="flash-word-boxes">
        {deck.cards.map((card, index) => (
          <WordBox
            key={card.id}
            notebookId={notebookId}
            deck={deck}
            card={card}
            index={index}
            disabled={disabled}
            save={save}
            onPending={onPending}
            hidden={
              !!filter &&
              !`${card.front} ${card.back} ${card.group}`
                .toLocaleLowerCase()
                .includes(filter.toLocaleLowerCase())
            }
          />
        ))}
      </ol>
      {!!filter &&
        !deck.cards.some((c) =>
          `${c.front} ${c.back} ${c.group}`
            .toLocaleLowerCase()
            .includes(filter.toLocaleLowerCase()),
        ) && <p>No words match this search.</p>}
      <button className="button quiet" onClick={onReview}>
        Add or remove entries · review sources
      </button>
    </div>
  );
}

function SaveState({ edit }: { edit: ReturnType<typeof useAutosave> }) {
  return (
    <div className="flash-word-save">
      <span role="status">{edit.status}</span>
      {edit.error && (
        <div role="alert">
          <p>{edit.error}</p>
          <button className="button quiet" onClick={edit.retry}>
            Retry save
          </button>
          <button className="button quiet" onClick={edit.discard}>
            Use saved version
          </button>
        </div>
      )}
    </div>
  );
}

function WordBox({
  notebookId,
  deck,
  card,
  index,
  disabled,
  save,
  onPending,
  hidden,
}: {
  notebookId: string;
  deck: FlashDeck;
  card: FlashCard;
  index: number;
  disabled: boolean;
  save: Save;
  onPending: Pending;
  hidden: boolean;
}) {
  const edit = useAutosave(
    `${notebookId}:flashcards:${deck.id}:word:${card.id}`,
    {
      front: card.front,
      back: card.back,
      group: card.group,
      example: card.example,
    },
    (body) => save({ action: "word", cardId: card.id, ...body }),
    onPending,
    card.id,
    disabled,
  );
  return (
    <li
      hidden={hidden}
      className="flash-word-box"
      aria-label={`Entry ${index + 1}`}
    >
      <div className="flash-fields">
        <label>
          {deck.frontLabel}
          <textarea
            aria-label={`Entry ${index + 1} ${deck.frontLabel}`}
            rows={2}
            maxLength={4000}
            disabled={disabled}
            value={edit.value.front}
            onChange={(e) => edit.set("front", e.target.value)}
          />
        </label>
        <label>
          {deck.backLabel}
          <textarea
            aria-label={`Entry ${index + 1} ${deck.backLabel}`}
            rows={2}
            maxLength={4000}
            disabled={disabled}
            value={edit.value.back}
            onChange={(e) => edit.set("back", e.target.value)}
          />
        </label>
      </div>
      <div className="flash-word-meta">
        <span>
          {card.group || `Entry ${index + 1}`} ·{" "}
          {deck.reviewedIds.includes(card.id)
            ? "Source checked"
            : "Source review pending"}
        </span>
        <SaveState edit={edit} />
      </div>
      <details>
        <summary>Example, chapter & source</summary>
        <label>
          Chapter or group
          <input
            aria-label={`Entry ${index + 1} chapter`}
            maxLength={200}
            value={edit.value.group}
            disabled={disabled}
            onChange={(e) => edit.set("group", e.target.value)}
          />
        </label>
        <label>
          Example
          <textarea
            aria-label={`Entry ${index + 1} example`}
            rows={2}
            maxLength={4000}
            value={edit.value.example}
            disabled={disabled}
            onChange={(e) => edit.set("example", e.target.value)}
          />
        </label>
        {card.evidence.map((e, i) => (
          <blockquote key={i}>
            <small>
              {deck.sources.find((s) => s.id === e.sourceId)?.title}
            </small>
            {e.quote}
          </blockquote>
        ))}
        {!!cardEvidenceIssues(card, deck).length && (
          <p className="flash-warning">
            Saved wording differs from the extracted source. Review the original
            before marking this pair checked.
          </p>
        )}
      </details>
    </li>
  );
}
