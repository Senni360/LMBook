import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, RotateCcw, Shuffle } from "lucide-react";
import { flashAnswerMatches, type FlashDeck } from "../../shared/flashcards";
import { useDraftText } from "../hooks/useDraftText";

type Session = {
  version: 1;
  reverse: boolean;
  typing: boolean;
  examples: boolean;
  dark: boolean;
  mouseGrading: boolean;
  groups: string[];
  order: string[];
  pos: number;
  outcomes: Record<string, "known" | "missed">;
};
function mix(ids: string[]) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function FlashcardStudy({
  notebookId,
  deck,
}: {
  notebookId: string;
  deck: FlashDeck;
}) {
  const groups = [...new Set(deck.cards.map((c) => c.group || "All entries"))];
  // Content changes get a fresh session; review-only changes do not erase progress.
  const identity = deck.cards
    .map((c) => `${c.id}:${c.front}:${c.back}`)
    .join("\n");
  let fingerprint = 2166136261;
  for (let i = 0; i < identity.length; i++)
    fingerprint = Math.imul(fingerprint ^ identity.charCodeAt(i), 16777619);
  const initial: Session = {
    version: 1,
    reverse: false,
    typing: false,
    examples: true,
    dark: false,
    mouseGrading: false,
    groups,
    order: deck.cards.map((c) => c.id),
    pos: 0,
    outcomes: {},
  };
  const storage = useDraftText(
    `${notebookId}:flashcards:${deck.id}:study:${fingerprint >>> 0}`,
    JSON.stringify(initial),
    300_000,
  );
  const [session, setSession] = useState<Session>(() => {
    try {
      const s = JSON.parse(storage.text);
      const ids = new Set(deck.cards.map((c) => c.id));
      if (
        s.version !== 1 ||
        !Array.isArray(s.order) ||
        !s.order.every(
          (id: unknown) => typeof id === "string" && ids.has(id),
        ) ||
        new Set(s.order).size !== s.order.length ||
        !Array.isArray(s.groups) ||
        !s.groups.every(
          (g: unknown) => typeof g === "string" && groups.includes(g),
        ) ||
        !Number.isInteger(s.pos) ||
        s.pos < 0 ||
        s.pos > s.order.length ||
        !s.outcomes ||
        typeof s.outcomes !== "object" ||
        !Object.values(s.outcomes).every(
          (v) => v === "known" || v === "missed",
        ) ||
        ![s.reverse, s.typing, s.examples, s.dark, s.mouseGrading].every(
          (v) => typeof v === "boolean",
        )
      )
        return initial;
      return s;
    } catch {
      return initial;
    }
  });
  const sessionRef = useRef(session);
  const update = (next: Session) => {
    sessionRef.current = next;
    setSession(next);
    storage.setText(JSON.stringify(next));
  };
  const [revealed, setRevealed] = useState("");
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<"correct" | "wrong" | null>(null);
  const [wrongAttempt, setWrongAttempt] = useState(false);
  const [padState, setPadState] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const typedSubmit = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      root.current?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  const card = deck.cards.find((c) => c.id === session.order[session.pos]);
  const faceKey = `${card?.id || "done"}:${session.reverse}`;
  const showingAnswer = !!card && revealed === faceKey;
  const answer = card && (session.reverse ? card.front : card.back);
  const outcomeKey = (id: string) =>
    `${session.reverse ? "back" : "front"}:${id}`;
  const selectedCards = deck.cards.filter((c) =>
    session.groups.includes(c.group || "All entries"),
  );
  const known = selectedCards.filter(
    (c) => session.outcomes[outcomeKey(c.id)] === "known",
  ).length;
  const missed = selectedCards.filter(
    (c) => session.outcomes[outcomeKey(c.id)] === "missed",
  ).length;
  const clearFace = () => {
    setRevealed("");
    setTyped("");
    setChecked(null);
    setWrongAttempt(false);
  };
  const move = (delta: number) => {
    clearFace();
    const current = sessionRef.current;
    update({
      ...current,
      pos: Math.min(current.order.length, Math.max(0, current.pos + delta)),
    });
  };
  const mark = (value: "known" | "missed") => {
    if (!card) return;
    clearFace();
    update({
      ...session,
      pos: session.pos + 1,
      outcomes: { ...session.outcomes, [outcomeKey(card.id)]: value },
    });
  };
  const restart = (
    mode: "all" | "missed" | "unanswered" | "shuffle",
    selectedGroups = session.groups,
  ) => {
    clearFace();
    const selected = deck.cards.filter((c) =>
      selectedGroups.includes(c.group || "All entries"),
    );
    let order = selected
      .filter((c) =>
        mode === "missed"
          ? session.outcomes[outcomeKey(c.id)] === "missed"
          : mode === "unanswered"
            ? !session.outcomes[outcomeKey(c.id)]
            : true,
      )
      .map((c) => c.id);
    if (mode === "shuffle") order = mix(order);
    update({ ...session, groups: selectedGroups, order, pos: 0 });
  };
  const check = () => {
    if (!card || !answer) return;
    if (checked === "correct") {
      move(1);
      return;
    }
    if (checked === "wrong") return;
    const correct = flashAnswerMatches(typed, answer);
    setChecked(correct ? "correct" : "wrong");
    if (!correct) setWrongAttempt(true);
    // A corrected retry stays in the missed pile for a later retrieval attempt.
    update({
      ...session,
      outcomes: {
        ...session.outcomes,
        [outcomeKey(card.id)]:
          correct && !wrongAttempt && !showingAnswer ? "known" : "missed",
      },
    });
    if (correct) setRevealed(faceKey);
  };
  const reveal = () => {
    if (!card) return;
    if (session.typing && !showingAnswer && checked !== "correct") {
      setWrongAttempt(true);
      update({
        ...session,
        outcomes: { ...session.outcomes, [outcomeKey(card.id)]: "missed" },
      });
    }
    setRevealed(showingAnswer ? "" : faceKey);
  };
  useEffect(() => {
    if (session.typing && card && !showingAnswer) input.current?.focus();
  }, [faceKey, session.typing, showingAnswer]);
  useEffect(() => {
    if (!session.typing && card)
      question.current?.focus({ preventScroll: true });
  }, [faceKey, showingAnswer, session.typing]);
  useEffect(() => {
    if (checked === "correct") typedSubmit.current?.focus();
  }, [checked]);

  const commands = useRef({
    move,
    mark,
    check,
    reveal,
    restart,
    session,
    card,
  });
  commands.current = { move, mark, check, reveal, restart, session, card };
  useEffect(() => {
    let frame = 0;
    let previous: boolean[] = [];
    let selectedIndex: number | null = null;
    const poll = () => {
      try {
        const pads = Array.from(navigator.getGamepads?.() || []).filter(
          (p): p is Gamepad => !!p && p.mapping === "standard",
        );
        const chosen =
          pads.find((p) => p.buttons.some((b) => b.pressed)) ||
          pads.find((p) => p.index === selectedIndex) ||
          pads[0];
        if (chosen) {
          if (selectedIndex !== chosen.index) {
            previous = chosen.buttons.map((b) => b.pressed);
            selectedIndex = chosen.index;
          }
          setPadState(
            "Controller connected · A reveal/check · X know · B learn again · D-pad navigate",
          );
          const tapped = (i: number) =>
            chosen.buttons[i]?.pressed && !previous[i];
          const c = commands.current;
          if (document.hasFocus() && !document.hidden) {
            if (!c.card) {
              if (tapped(0)) c.restart("all");
            } else if (tapped(14)) c.move(-1);
            else if (tapped(15)) c.move(1);
            else if (tapped(0)) c.session.typing ? c.check() : c.reveal();
            else if (!c.session.typing && tapped(2)) c.mark("known");
            else if (!c.session.typing && tapped(1)) c.mark("missed");
          }
          previous = chosen.buttons.map((b) => b.pressed);
        } else {
          previous = [];
          selectedIndex = null;
          setPadState("");
        }
      } catch {
        setPadState(
          "Controller access is unavailable. Keyboard and on-screen controls still work.",
        );
        return;
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <section
      className={`flash-study${session.dark ? " flash-study-dark" : ""}`}
      ref={root}
      aria-label="Flashcard practice"
      onKeyDown={(event) => {
        if (
          event.repeat ||
          (event.target as HTMLElement).matches(
            "input, textarea, select, [contenteditable=true]",
          )
        )
          return;
        if (!card) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        } else if (!session.typing && event.key === "1") {
          event.preventDefault();
          mark("missed");
        } else if (!session.typing && event.key === "2") {
          event.preventDefault();
          mark("known");
        } else if (
          event.key === " " &&
          (event.target as HTMLElement).closest(".flash-question")
        ) {
          event.preventDefault();
          reveal();
        }
      }}
    >
      <h3>{deck.title}</h3>
      <details className="flash-chapters">
        <summary>
          Chapters · {session.groups.length}/{groups.length} selected
        </summary>
        <div className="flash-groups" aria-label="Practice chapters">
          {groups.map((group) => (
            <button
              className="button"
              key={group}
              aria-pressed={session.groups.includes(group)}
              onClick={() =>
                restart(
                  "all",
                  session.groups.includes(group)
                    ? session.groups.filter((g) => g !== group)
                    : [...session.groups, group],
                )
              }
            >
              {group}
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <div className="flash-actions">
            <button
              className="button quiet"
              onClick={() => restart("all", groups)}
            >
              Select all chapters
            </button>
            <button className="button quiet" onClick={() => restart("all", [])}>
              Deselect all chapters
            </button>
          </div>
        )}
      </details>
      <div className="flash-study-controls">
        <button
          className="button"
          aria-label={`Switch direction: ${session.reverse ? deck.backLabel : deck.frontLabel} to ${session.reverse ? deck.frontLabel : deck.backLabel}`}
          title="Switch direction using this same word list"
          onClick={() => {
            clearFace();
            update({
              ...session,
              reverse: !session.reverse,
              order: selectedCards.map((c) => c.id),
              pos: 0,
            });
          }}
        >
          <ArrowLeftRight size={16} />{" "}
          {session.reverse ? deck.backLabel : deck.frontLabel} →{" "}
          {session.reverse ? deck.frontLabel : deck.backLabel}
        </button>
        <button
          className="button"
          onClick={() => restart("shuffle")}
          disabled={!selectedCards.length}
        >
          <Shuffle size={16} /> Shuffle
        </button>
        <button
          className="button"
          aria-pressed={!session.typing}
          onClick={() => {
            clearFace();
            update({ ...session, typing: false });
          }}
        >
          Flashcards
        </button>
        <button
          className="button"
          aria-pressed={session.typing}
          onClick={() => {
            clearFace();
            update({ ...session, typing: true });
          }}
        >
          Type answers
        </button>
        <details>
          <summary>Practice options</summary>
          <label className="flash-check">
            <input
              type="checkbox"
              checked={session.examples}
              onChange={(e) =>
                update({ ...session, examples: e.target.checked })
              }
            />{" "}
            Show examples after reveal
          </label>
          <label className="flash-check">
            <input
              type="checkbox"
              checked={session.dark}
              onChange={(e) => update({ ...session, dark: e.target.checked })}
            />{" "}
            Dark study surface
          </label>
          <label className="flash-check">
            <input
              type="checkbox"
              checked={session.mouseGrading}
              onChange={(e) =>
                update({ ...session, mouseGrading: e.target.checked })
              }
            />{" "}
            Mouse grading: left click = learn again; right click = know
          </label>
        </details>
      </div>
      <p className="flash-help">
        {known}/{selectedCards.length} marked known in this direction · {missed}{" "}
        to revisit. Progress is saved on this device.
      </p>
      {storage.storageError && <p role="alert">{storage.storageError}</p>}
      {card ? (
        <>
          <div className="flash-position">
            <span>{card.group}</span>
            <span>
              {session.pos + 1} / {session.order.length}
            </span>
          </div>
          <progress
            aria-label="Position in this round"
            value={session.pos}
            max={session.order.length}
          />
          {/* One face only. A new card can never inherit or briefly paint a hidden answer. */}
          <button
            ref={question}
            type="button"
            className="flash-question"
            key={`${faceKey}:${showingAnswer ? "answer" : "question"}`}
            onClick={() =>
              session.mouseGrading && !session.typing
                ? mark("missed")
                : reveal()
            }
            onContextMenu={(e) => {
              if (session.mouseGrading && !session.typing) {
                e.preventDefault();
                mark("known");
              }
            }}
          >
            <span className="flash-face-label">
              {showingAnswer
                ? session.reverse
                  ? deck.frontLabel
                  : deck.backLabel
                : session.reverse
                  ? deck.backLabel
                  : deck.frontLabel}
            </span>
            <span className="flash-term">
              {showingAnswer
                ? answer
                : session.reverse
                  ? card.back
                  : card.front}
            </span>
            {showingAnswer && session.examples && card.example && (
              <span className="flash-example">{card.example}</span>
            )}
            <span className="flash-card-hint">
              {session.mouseGrading && !session.typing
                ? "Left: learn again · Right: know · Space: reveal"
                : showingAnswer
                  ? "Answer revealed"
                  : "Reveal when you are ready"}
            </span>
          </button>
          {session.typing && (
            <form
              className="flash-typing"
              onSubmit={(e) => {
                e.preventDefault();
                check();
              }}
            >
              <label>
                Type the exact answer
                <input
                  ref={input}
                  value={typed}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={checked !== null || showingAnswer}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
              <p className="flash-help">
                Articles, spelling, capitalization and accents count. Only
                surrounding spaces are ignored.
              </p>
              <div role="status">
                {checked === "correct"
                  ? wrongAttempt
                    ? "Correct on retry. Kept for another practice round."
                    : "Matches the saved answer."
                  : checked === "wrong"
                    ? "Does not match. Try again or reveal the saved answer."
                    : showingAnswer
                      ? "Answer revealed. Marked for another practice round when you continue."
                      : ""}
              </div>
              <div className="flash-actions">
                <button
                  className="button primary"
                  type="submit"
                  ref={typedSubmit}
                  disabled={
                    checked === "wrong" ||
                    (showingAnswer && checked !== "correct") ||
                    !typed.trim()
                  }
                >
                  {checked === "correct" ? "Next card" : "Check answer"}
                </button>
                {checked === "wrong" && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setTyped("");
                      setChecked(null);
                      setRevealed("");
                      requestAnimationFrame(() => input.current?.focus());
                    }}
                  >
                    Try again
                  </button>
                )}
              </div>
            </form>
          )}
          <div className="flash-study-nav">
            <button
              className="button"
              disabled={session.pos === 0}
              onClick={() => move(-1)}
            >
              ← Previous
            </button>
            <button
              className="button"
              onClick={() => {
                if (session.typing && !showingAnswer)
                  update({
                    ...session,
                    outcomes: {
                      ...session.outcomes,
                      [outcomeKey(card.id)]: "missed",
                    },
                  });
                reveal();
              }}
            >
              {showingAnswer ? "Show question" : "Reveal answer"}
            </button>
            {!session.typing && (
              <>
                <button className="button" onClick={() => mark("missed")}>
                  Learn again · 1
                </button>
                <button
                  className="button primary"
                  onClick={() => mark("known")}
                >
                  I know this · 2
                </button>
              </>
            )}
            <button className="button" onClick={() => move(1)}>
              Next →
            </button>
          </div>
        </>
      ) : !session.groups.length ? (
        <div className="flash-round-done">
          <h3>Select a chapter to practice</h3>
          <p>Your saved progress is kept when you change the selection.</p>
        </div>
      ) : (
        <div className="flash-round-done">
          <h3>Round finished</h3>
          <p>
            {known} marked known · {missed} to revisit ·{" "}
            {selectedCards.length - known - missed} unanswered.
          </p>
          <div className="flash-actions">
            <button
              className="button primary"
              disabled={!missed}
              onClick={() => restart("missed")}
            >
              Practice missed cards
            </button>
            <button
              className="button"
              disabled={selectedCards.length === known + missed}
              onClick={() => restart("unanswered")}
            >
              Practice unanswered
            </button>
            <button className="button" onClick={() => restart("all")}>
              <RotateCcw size={16} /> Start another round
            </button>
          </div>
        </div>
      )}
      <p className="flash-help">
        Focus the card: Space reveals · ← → navigate · 1 learn again · 2 know.
        Typing uses Enter to check.
      </p>
      {padState && (
        <p className="flash-help" role="status">
          {padState}
        </p>
      )}
    </section>
  );
}
