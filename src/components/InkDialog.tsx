import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { InkButton } from "./InkControl";

type Choice = { label: string; value: string; destructive?: boolean };
type Question = {
  title: string;
  message: string;
  choices: Choice[];
  cancel: string;
  resolve: (value: string) => void;
};
let queue: Question[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => queue[0];

export function chooseInk(
  question: Omit<Question, "resolve">,
): Promise<string> {
  return new Promise((resolve) => {
    queue = [...queue, { ...question, resolve }];
    notify();
  });
}

export async function confirmInk(
  message: string,
  title: string,
  action: string,
) {
  return (
    (await chooseInk({
      title,
      message,
      cancel: "cancel",
      choices: [
        { label: "Cancel", value: "cancel" },
        { label: action, value: "confirm", destructive: true },
      ],
    })) === "confirm"
  );
}

export function InkDialogHost() {
  const question = useSyncExternalStore(subscribe, snapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (!question) return;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    element.querySelector<HTMLButtonElement>("[data-dialog-cancel]")?.focus();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [question]);
  if (!question) return null;
  const answer = (value: string) => {
    question.resolve(value);
    queue = queue.slice(1);
    notify();
  };
  return (
    <dialog
      ref={dialog}
      className="ink-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={(event) => {
        event.preventDefault();
        answer(question.cancel);
      }}
    >
      <div className="ink-dialog-heading">
        <h2 id={`${id}-title`}>{question.title}</h2>
        <InkButton
          className="icon-button"
          aria-label="Close dialog"
          onClick={() => answer(question.cancel)}
        >
          <X size={18} />
        </InkButton>
      </div>
      <p id={`${id}-message`}>{question.message}</p>
      <div className="ink-dialog-actions">
        {question.choices.map((choice) => (
          <InkButton
            key={choice.value}
            type="button"
            autoFocus={choice.value === question.cancel}
            data-dialog-cancel={choice.value === question.cancel || undefined}
            className={`button ${choice.destructive ? "ink-danger" : ""}`}
            onClick={() => answer(choice.value)}
          >
            {choice.label}
          </InkButton>
        ))}
      </div>
    </dialog>
  );
}
