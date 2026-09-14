import { useEffect, useRef, useState } from "react";
import { BookOpen, Download, Plus } from "lucide-react";
import { uid, type Notebook } from "../../shared/model";
import {
  flashDeckReport,
  cardEvidenceIssues,
  type FlashCard,
  type FlashDeck,
} from "../../shared/flashcards";
import { DownloadLink } from "./Downloads";
import { useObjectDraft } from "../hooks/useObjectDraft";
import { useDraftText } from "../hooks/useDraftText";
import { FlashcardStudy } from "./FlashcardStudy";
import "./flashcards.css";
const vocabularyPrompt =
  "Make flashcards for every word pair in the selected material. Keep the supplied translations exactly.";
const conceptsPrompt =
  "Create focused questions and answers for the key concepts in the selected sources. Preserve important qualifications.";

type Props = {
  n: Notebook;
  disabled: boolean;
  change: (url: string, method?: string, body?: unknown) => Promise<void>;
  run: (label: string, work: () => Promise<void>) => Promise<void>;
};
const sourceReady = (s: Notebook["sources"][number]) =>
  !!s.text.trim() &&
  !["pending", "recognizing", "transcribing"].includes(
    s.processing?.status || "",
  );

export function Flashcards({ n, disabled, change, run }: Props) {
  const decks = n.flashcards || [];
  const chosen = useDraftText(
    `${n.id}:flashcards:selection`,
    decks.at(-1)?.id || "",
    100,
  );
  const deck = decks.find((d) => d.id === chosen.text) || decks.at(-1);
  const [creating, setCreating] = useState(!decks.length);
  const [view, setView] = useState<"study" | "review">("study");
  const previousCount = useRef(decks.length);
  useEffect(() => {
    if (decks.length > previousCount.current) {
      chosen.setText(decks.at(-1)!.id);
      setCreating(false);
      setView("review");
    }
    previousCount.current = decks.length;
  }, [decks.length]);
  const form = useObjectDraft(
    `${n.id}:flashcards:create`,
    {
      title: "",
      prompt:
        "Make flashcards for every word pair in the selected material. Keep the supplied translations exactly.",
      mode: "vocabulary",
      sources: JSON.stringify(n.sources.filter(sourceReady).map((s) => s.id)),
      frontLabel: "Deutsch",
      backLabel: "Nederlands",
      expectedCount: "",
    },
    [
      "title",
      "prompt",
      "mode",
      "sources",
      "frontLabel",
      "backLabel",
      "expectedCount",
    ],
  );
  const values = form.value;
  const update = (patch: Partial<typeof values>) =>
    form.setValue({ ...values, ...patch });
  let selected: string[] = [];
  try {
    const raw = JSON.parse(values.sources);
    if (Array.isArray(raw))
      selected = raw.filter(
        (id) =>
          typeof id === "string" &&
          n.sources.some((s) => s.id === id && sourceReady(s)),
      );
  } catch {
    /* Recover through selection controls. */
  }
  const report = deck && flashDeckReport(deck);
  return (
    <div className="flashcards-workspace">
      <div className="section-heading">
        <div>
          <h2>Flashcards</h2>
          <p>Practice your material, with the answer tied to its source.</p>
        </div>
        <button
          className="button"
          onClick={() => setCreating(!creating)}
          aria-expanded={creating}
        >
          <Plus size={17} /> {creating ? "Close creation" : "Create a deck"}
        </button>
      </div>
      {creating && (
        <section className="flash-create" aria-label="Create flashcards">
          <div className="flash-create-main">
            <label>
              Deck title
              <input
                maxLength={180}
                value={values.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="German · chapters 11–15"
              />
            </label>
            <label>
              Card type
              <select
                value={values.mode}
                onChange={(e) =>
                  update({
                    mode: e.target.value,
                    ...(e.target.value === "concepts"
                      ? {
                          frontLabel: "Question",
                          backLabel: "Answer",
                        }
                      : {
                          frontLabel: "Deutsch",
                          backLabel: "Nederlands",
                        }),
                    prompt: [vocabularyPrompt, conceptsPrompt].includes(
                      values.prompt,
                    )
                      ? e.target.value === "concepts"
                        ? conceptsPrompt
                        : vocabularyPrompt
                      : values.prompt,
                  })
                }
              >
                <option value="vocabulary">
                  Vocabulary · exact source pairs
                </option>
                <option value="concepts">
                  Concepts · generated questions and answers
                </option>
              </select>
            </label>
            <label>
              Your instructions
              <textarea
                rows={5}
                aria-label="Your instructions"
                maxLength={12000}
                value={values.prompt}
                onChange={(e) => update({ prompt: e.target.value })}
              />
            </label>
            <div className="flash-fields">
              <label>
                Front label
                <input
                  maxLength={60}
                  value={values.frontLabel}
                  onChange={(e) => update({ frontLabel: e.target.value })}
                />
              </label>
              <label>
                Back label
                <input
                  maxLength={60}
                  value={values.backLabel}
                  onChange={(e) => update({ backLabel: e.target.value })}
                />
              </label>
            </div>
            {values.mode === "vocabulary" && (
              <label>
                Expected entries in the source (optional)
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={values.expectedCount}
                  onChange={(e) => update({ expectedCount: e.target.value })}
                  placeholder="Count from the original list"
                />
              </label>
            )}
            <p className="flash-help">
              {values.mode === "vocabulary"
                ? "The source's translations are copied. Review extracted pairs and coverage before studying; PDF text can mix up columns or letters."
                : "Questions and answers are generated. Matching citations support your review; they do not prove an answer is correct."}
            </p>
            {form.error && <p role="alert">{form.error}</p>}
            {form.restored && (
              <p className="flash-help">Your unfinished setup was restored.</p>
            )}
            <button
              className="button primary"
              disabled={
                disabled ||
                !values.title.trim() ||
                !values.prompt.trim() ||
                !selected.length ||
                !values.frontLabel.trim() ||
                !values.backLabel.trim()
              }
              onClick={() =>
                void run("Creating flashcards", async () => {
                  const count = values.expectedCount
                    ? Number(values.expectedCount)
                    : undefined;
                  if (
                    count !== undefined &&
                    (!Number.isInteger(count) || count < 1 || count > 2000)
                  )
                    throw new Error(
                      "Enter a source count between 1 and 2,000.",
                    );
                  await change(`/notebooks/${n.id}/flashcards`, "POST", {
                    title: values.title,
                    mode: values.mode,
                    prompt: values.prompt,
                    sourceIds: selected,
                    frontLabel: values.frontLabel,
                    backLabel: values.backLabel,
                    ...(count !== undefined ? { expectedCount: count } : {}),
                  });
                })
              }
            >
              <BookOpen size={17} /> Create flashcards
            </button>
          </div>
          <div className="flash-source-picker">
            <h3>Use these sources</h3>
            <p className="flash-help">
              {selected.length} of {n.sources.length} selected
            </p>
            <div className="flash-actions">
              <button
                className="button quiet"
                disabled={disabled || !n.sources.some(sourceReady)}
                onClick={() =>
                  update({
                    sources: JSON.stringify(
                      n.sources.filter(sourceReady).map((s) => s.id),
                    ),
                  })
                }
              >
                Select all
              </button>
              <button
                className="button quiet"
                disabled={disabled || !selected.length}
                onClick={() => update({ sources: "[]" })}
              >
                Deselect all
              </button>
            </div>
            {!n.sources.length && (
              <p>
                Add course material in Sources, or import your existing deck
                below.
              </p>
            )}
            {n.sources.map((s) => (
              <label className="flash-source-choice" key={s.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  disabled={disabled || !sourceReady(s)}
                  onChange={(e) =>
                    update({
                      sources: JSON.stringify(
                        e.target.checked
                          ? [...selected, s.id]
                          : selected.filter((id) => id !== s.id),
                      ),
                    })
                  }
                />
                <span>
                  {s.title}
                  {!sourceReady(s) && (
                    <small>Finish text extraction first</small>
                  )}
                </span>
              </label>
            ))}
            <details className="flash-import" open={!n.sources.length}>
              <summary>Import an existing word list</summary>
              <p className="flash-help">
                Your German flashcard HTML, or a UTF-8 text file with
                tab-separated word, translation, optional chapter and example.
                The list is copied without a model call.
              </p>
              <label>
                Word-list file
                <input
                  type="file"
                  accept=".html,.htm,.tsv,.txt"
                  disabled={disabled}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (!file) return;
                    void run("Importing flashcards", async () => {
                      if (file.size > 2_000_000)
                        throw new Error(
                          "Choose a flashcard file smaller than 2 MB.",
                        );
                      await change(
                        `/notebooks/${n.id}/flashcards/import`,
                        "POST",
                        {
                          content: await file.text(),
                          filename: file.name,
                          title:
                            values.title.trim() ||
                            file.name.replace(/\.[^.]+$/, "").slice(0, 180),
                        },
                      );
                    });
                  }}
                />
              </label>
            </details>
          </div>
        </section>
      )}
      {deck && (
        <section className="flash-deck" aria-label="Saved flashcard deck">
          <div className="flash-deck-toolbar">
            <label>
              Saved deck
              <select
                value={deck.id}
                onChange={(e) => {
                  chosen.setText(e.target.value);
                  setView("study");
                }}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} · {d.cards.length} cards
                    {d.status === "generating"
                      ? " · creating"
                      : d.status === "error"
                        ? " · interrupted"
                        : ""}
                  </option>
                ))}
              </select>
            </label>
            {report?.ready && (
              <DownloadLink
                className="button quiet"
                filename={`flashcards-${deck.id}.json`}
                href={`/api/notebooks/${n.id}/flashcards/${deck.id}/export`}
              >
                <Download size={17} /> Export deck
              </DownloadLink>
            )}
          </div>
          {deck.status === "generating" ? (
            <p role="status">
              Creating a draft from the selected sources. You can switch
              sections; progress and Stop are shown above.
            </p>
          ) : deck.status === "error" ? (
            <div role="alert">
              <p>{deck.error}</p>
              <button
                className="button"
                onClick={() => {
                  update({
                    title: deck.title,
                    prompt: deck.prompt,
                    mode: deck.mode,
                    frontLabel: deck.frontLabel,
                    backLabel: deck.backLabel,
                    sources: JSON.stringify(deck.sources.map((s) => s.id)),
                    expectedCount: String(deck.expectedCount || ""),
                  });
                  setCreating(true);
                }}
              >
                Use this setup again
              </button>
            </div>
          ) : (
            <>
              <div className="flash-verification">
                <p>
                  {deck.origin === "imported"
                    ? `${deck.cards.length} pairs based on your imported list. The app has not verified them against a separate idioom.`
                    : deck.mode === "concepts"
                      ? "Quoted passages match the saved sources. Review the generated answers for meaning and completeness."
                      : report?.ready
                        ? `${report.total}/${report.total} pairs checked by you. Cards use these exact saved pairs.`
                        : `${report?.reviewed}/${report?.total} pairs checked. Complete the source review before studying.`}
                </p>
              </div>
              <div className="flash-actions" aria-label="Deck view">
                <button
                  className="button"
                  aria-pressed={view === "study" && !!report?.ready}
                  disabled={!report?.ready}
                  onClick={() => setView("study")}
                >
                  Study
                </button>
                <button
                  className="button"
                  aria-pressed={view === "review" || !report?.ready}
                  onClick={() => setView("review")}
                >
                  Review sources
                </button>
              </div>
              {view === "study" && report?.ready ? (
                <FlashcardStudy key={deck.id} notebookId={n.id} deck={deck} />
              ) : (
                <FlashcardReview
                  key={deck.id}
                  n={n}
                  deck={deck}
                  disabled={disabled}
                  run={run}
                  change={change}
                  onStudy={() => setView("study")}
                />
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function FlashcardReview({
  n,
  deck,
  disabled,
  run,
  change,
  onStudy,
}: Props & { deck: FlashDeck; onStudy: () => void }) {
  const [filter, setFilter] = useState("");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [editing, setEditing] = useState<FlashCard | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState<string | null>(null);
  const count = useDraftText(
    `${n.id}:flashcards:${deck.id}:count`,
    deck.expectedCount === undefined ? "" : String(deck.expectedCount),
    10,
  );
  const report = flashDeckReport(deck);
  const cards = deck.cards.filter(
    (c) =>
      (!onlyUnchecked || !deck.reviewedIds.includes(c.id)) &&
      `${c.front} ${c.back} ${c.group}`
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase()),
  );
  const mutate = (body: object) =>
    change(`/notebooks/${n.id}/flashcards/${deck.id}`, "PUT", {
      ...body,
      revision: deck.revision,
    });
  const changedSources = deck.sources.filter((s) => {
    const current = n.sources.find((c) => c.id === s.id);
    return current && current.text !== s.text;
  });
  return (
    <div className="flash-review">
      {!!changedSources.length && (
        <p role="status" className="flash-warning">
          {changedSources.map((s) => s.title).join(", ")} changed after this
          deck was created. This review uses the saved version; create a new
          deck to use the updated source.
        </p>
      )}
      <p className="flash-help">
        Check the exact wording and row pairing against the original. Text
        matching alone cannot detect an incorrectly extracted column. Example
        sentences are study aids and are outside the pair check.
      </p>
      {!!report.manualTranscriptions && (
        <p className="flash-warning">
          {report.manualTranscriptions} entry/entries were manually transcribed
          from an original. These need a human source check; their corrected
          text is not an automatic match to the extraction.
        </p>
      )}
      <div className="flash-actions">
        {deck.sources.map((s) => (
          <span key={s.id} className="flash-saved-source">
            <button
              className="button quiet"
              onClick={() =>
                setEvidenceOpen(evidenceOpen === s.id ? null : s.id)
              }
              aria-expanded={evidenceOpen === s.id}
            >
              {s.title} · saved text
            </button>
            {s.attachment && (
              <DownloadLink
                className="button quiet"
                filename={s.attachment.filename}
                href={`/api/notebooks/${n.id}/flashcards/${deck.id}/sources/${s.id}/original`}
              >
                Open original
              </DownloadLink>
            )}
          </span>
        ))}
      </div>
      {evidenceOpen && (
        <section className="flash-source-text" aria-label="Saved source text">
          <button
            className="button quiet"
            onClick={() => setEvidenceOpen(null)}
          >
            Close saved text
          </button>
          <pre>{deck.sources.find((s) => s.id === evidenceOpen)?.text}</pre>
        </section>
      )}
      {deck.origin === "imported" && deck.revision === 0 && (
        <div className="flash-import-accept">
          <p>
            The pairs were copied directly from your file. You can use that file
            as the answer key. This does not check it against a separate
            textbook.
          </p>
          <button
            className="button"
            disabled={disabled}
            onClick={() =>
              void run("Accepting imported list", async () => {
                await mutate({ action: "accept-import" });
                onStudy();
              })
            }
          >
            Use imported list as answer key
          </button>
        </div>
      )}
      <div className="flash-review-controls">
        <label>
          Find an entry
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Word, translation or chapter"
          />
        </label>
        <label className="flash-check">
          <input
            type="checkbox"
            checked={onlyUnchecked}
            onChange={(e) => setOnlyUnchecked(e.target.checked)}
          />{" "}
          Unchecked only
        </label>
        <button
          className="button"
          disabled={disabled}
          onClick={() =>
            setEditing({
              id: uid(),
              front: "",
              back: "",
              group: "",
              example: "",
              evidence: [{ sourceId: deck.sources[0].id, quote: "" }],
            })
          }
        >
          <Plus size={16} /> Add missing entry
        </button>
      </div>
      {!!report.repeatedPairs && (
        <p className="flash-warning">
          {report.repeatedPairs} repeated pair(s). Check whether they are
          intentional before confirming coverage.
        </p>
      )}
      {!report.countMatches && (
        <p className="flash-warning">
          Expected {deck.expectedCount} entries; found {report.total}. Resolve
          the difference against the source.
        </p>
      )}
      {!cards.length && (
        <p>
          No entries match this view. Change the search or unchecked filter.
        </p>
      )}
      <ol className="flash-entry-list">
        {cards.map((card) => (
          <li key={card.id}>
            <div className="flash-entry-pair">
              <div>
                <small>{card.group || deck.frontLabel}</small>
                <strong>{card.front}</strong>
              </div>
              <div>
                <small>{deck.backLabel}</small>
                <strong>{card.back}</strong>
              </div>
            </div>
            <details>
              <summary>
                Source evidence{card.example ? " and example" : ""}
              </summary>
              {card.evidence.map((e, i) => (
                <div key={i}>
                  <p className="flash-help">
                    {deck.sources.find((s) => s.id === e.sourceId)?.title}
                  </p>
                  <blockquote>{e.quote}</blockquote>
                </div>
              ))}
              {card.example && <p>Example: {card.example}</p>}
              {card.transcription && (
                <p className="flash-warning">
                  Manual transcription · {card.transcription.location}:{" "}
                  {card.transcription.note}. The extracted passage above is kept
                  unchanged.
                </p>
              )}
            </details>
            {cardEvidenceIssues(card, deck).map((issue) => (
              <p role="alert" key={issue}>
                {issue}
              </p>
            ))}
            <div className="flash-actions">
              <label className="flash-check">
                <input
                  type="checkbox"
                  checked={deck.reviewedIds.includes(card.id)}
                  disabled={disabled}
                  onChange={(e) =>
                    void run("Saving entry review", () =>
                      mutate({
                        action: "review",
                        cardId: card.id,
                        checked: e.target.checked,
                      }),
                    )
                  }
                />{" "}
                Wording and pairing checked
              </label>
              <button
                className="button quiet"
                disabled={disabled}
                onClick={() => setEditing(card)}
              >
                Edit entry
              </button>
            </div>
          </li>
        ))}
      </ol>
      {editing && (
        <EntryEditor
          key={editing.id}
          card={editing}
          deck={deck}
          notebookId={n.id}
          disabled={disabled}
          onClose={() => setEditing(null)}
          save={(card, accepted) =>
            run("Saving entry", async () => {
              await mutate({ action: "entry", card });
              accepted();
              setEditing(null);
            })
          }
          remove={() =>
            run("Removing entry", async () => {
              await mutate({ action: "remove-entry", cardId: editing.id });
              setEditing(null);
            })
          }
        />
      )}
      {deck.mode === "vocabulary" && (
        <section className="flash-confirm">
          <h3>Check the whole requested list</h3>
          <p>
            Every requested source entry must be present with its correct pair.
            Repeated words can represent different meanings. Confirm the count
            against the original, including any entries extraction missed.
          </p>
          <label>
            Number of requested source entries
            <input
              type="number"
              min={1}
              max={2000}
              value={count.text}
              onChange={(e) => count.setText(e.target.value)}
            />
          </label>
          <p>
            {report.reviewed}/{report.total} pairs checked
            {report.invalid.length
              ? `; ${report.invalid.length} source mismatches`
              : ""}
            .
          </p>
          <button
            className="button primary"
            disabled={
              disabled ||
              report.reviewed !== report.total ||
              !report.total ||
              !!report.invalid.length ||
              Number(count.text) !== report.total
            }
            onClick={() =>
              void run("Confirming deck coverage", async () => {
                await mutate({
                  action: "confirm",
                  expectedCount: Number(count.text),
                });
                onStudy();
              })
            }
          >
            I checked every requested entry · start studying
          </button>
        </section>
      )}
    </div>
  );
}

function EntryEditor({
  card,
  deck,
  notebookId,
  disabled,
  onClose,
  save,
  remove,
}: {
  card: FlashCard;
  deck: FlashDeck;
  notebookId: string;
  disabled: boolean;
  onClose: () => void;
  save: (card: FlashCard, accepted: () => void) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const edit = useObjectDraft(
    `${notebookId}:flashcards:${deck.id}:entry:${card.id}`,
    {
      front: card.front,
      back: card.back,
      group: card.group,
      example: card.example,
      sourceId: card.evidence[0].sourceId,
      quote: card.evidence[0].quote,
      manual: !!card.transcription,
      location: card.transcription?.location || "",
      note: card.transcription?.note || "",
    },
    [
      "front",
      "back",
      "group",
      "example",
      "sourceId",
      "quote",
      "manual",
      "location",
      "note",
    ],
  );
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: "instant" });
    ref.current?.focus();
  }, []);
  const set = (
    key: Exclude<keyof typeof edit.value, "manual">,
    value: string,
  ) => edit.setValue({ ...edit.value, [key]: value });
  return (
    <div className="flash-editor" ref={ref} tabIndex={-1}>
      <h3>Edit source entry</h3>
      <p className="flash-help">
        Saving clears this entry's review and the coverage confirmation.
      </p>
      <div className="flash-fields">
        <label>
          {deck.frontLabel}
          <textarea
            value={edit.value.front}
            aria-label={deck.frontLabel}
            maxLength={4000}
            onChange={(e) => set("front", e.target.value)}
          />
        </label>
        <label>
          {deck.backLabel}
          <textarea
            value={edit.value.back}
            aria-label={deck.backLabel}
            maxLength={4000}
            onChange={(e) => set("back", e.target.value)}
          />
        </label>
      </div>
      <label>
        Chapter or group
        <input
          value={edit.value.group}
          maxLength={200}
          onChange={(e) => set("group", e.target.value)}
        />
      </label>
      <label>
        Example (optional)
        <textarea
          value={edit.value.example}
          aria-label="Example (optional)"
          maxLength={4000}
          onChange={(e) => set("example", e.target.value)}
        />
      </label>
      <label>
        Source
        <select
          value={edit.value.sourceId}
          onChange={(e) => set("sourceId", e.target.value)}
        >
          {deck.sources.map((s) => (
            <option value={s.id} key={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Exact supporting passage
        <textarea
          rows={5}
          aria-label="Exact supporting passage"
          maxLength={12000}
          value={edit.value.quote}
          onChange={(e) => set("quote", e.target.value)}
        />
      </label>
      <label className="flash-check">
        <input
          type="checkbox"
          checked={edit.value.manual}
          onChange={(e) =>
            edit.setValue({ ...edit.value, manual: e.target.checked })
          }
        />{" "}
        I am transcribing from the original because extracted text is wrong or
        missing
      </label>
      {edit.value.manual && (
        <>
          <p className="flash-help">
            Keep the faulty extracted passage (or a nearby heading) above. Enter
            the correct pair from the original and record where it appears. This
            is a human transcription, not an automatic text match.
          </p>
          <label>
            Location in original
            <input
              maxLength={300}
              placeholder="Page 12, chapter 3, row 8"
              value={edit.value.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </label>
          <label>
            What was corrected
            <textarea
              maxLength={1000}
              aria-label="What was corrected"
              value={edit.value.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </label>
        </>
      )}
      {edit.error && <p role="alert">{edit.error}</p>}
      <div className="flash-actions">
        <button
          className="button primary"
          disabled={
            disabled ||
            !edit.value.front.trim() ||
            !edit.value.back.trim() ||
            !edit.value.quote.trim() ||
            (edit.value.manual &&
              (!edit.value.location.trim() || !edit.value.note.trim()))
          }
          onClick={() =>
            void save(
              {
                ...card,
                front: edit.value.front,
                back: edit.value.back,
                group: edit.value.group,
                example: edit.value.example,
                transcription: edit.value.manual
                  ? { location: edit.value.location, note: edit.value.note }
                  : undefined,
                evidence: [
                  { sourceId: edit.value.sourceId, quote: edit.value.quote },
                ],
              },
              () => {
                edit.accept();
              },
            )
          }
        >
          Save entry
        </button>
        <button className="button quiet" onClick={onClose}>
          Close editor
        </button>
        {deck.cards.some((c) => c.id === card.id) && (
          <button
            className="button quiet"
            disabled={disabled}
            onClick={() => setRemoveConfirm(!removeConfirm)}
          >
            Remove this entry
          </button>
        )}
      </div>
      {removeConfirm && (
        <div>
          <p>
            Remove “{card.front}” from this deck? The saved source stays
            available so you can add it again.
          </p>
          <button
            className="button"
            disabled={disabled}
            onClick={() => void remove()}
          >
            Confirm removal
          </button>
          <button
            className="button quiet"
            onClick={() => setRemoveConfirm(false)}
          >
            Keep entry
          </button>
        </div>
      )}
    </div>
  );
}
