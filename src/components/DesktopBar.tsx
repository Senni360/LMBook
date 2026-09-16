import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Minus,
  Square,
  Copy,
  X,
} from "lucide-react";
import { InkButton } from "./InkControl";
import { chooseInk } from "./InkDialog";

export function DesktopBar({
  title,
  onNew,
  onSettings,
}: {
  title: string;
  onNew: () => void;
  onSettings: () => void;
}) {
  const desktop = window.sennibookDesktop;
  const [state, setState] = useState({
    maximized: false,
    fullscreen: false,
    focused: true,
    platform: "win32",
  });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!desktop) return;
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.key === "F10" &&
        !event.shiftKey &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [desktop]);
  useEffect(() => {
    if (!desktop) return;
    void desktop
      .windowState()
      .then(setState)
      .catch(() =>
        setError(
          "Window controls could not be synchronized. Reopen LMBook to try again.",
        ),
      );
    const offState = desktop.onWindowState(setState);
    const offQuit = desktop.onQuitRequest(async (id) => {
      const choice = await chooseInk({
        title: "Generation is still running",
        message:
          "Leave LMBook running in the background to finish your work. Quitting cancels active tasks; completed chapters stay saved.",
        cancel: "stay",
        choices: [
          { label: "Stay in LMBook", value: "stay" },
          { label: "Keep working in background", value: "background" },
          { label: "Cancel tasks and quit", value: "quit", destructive: true },
        ],
      });
      await desktop
        .quitResponse(id, choice as "stay" | "background" | "quit")
        .catch(() =>
          setError("The close request could not finish. Please try again."),
        );
    });
    return () => {
      offState();
      offQuit();
    };
  }, [desktop]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", close);
    function close() {
      setOpen(false);
    }
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", close);
    };
  }, [open]);
  if (!desktop) return null;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const command = (action: Parameters<typeof desktop.windowAction>[0]) => {
    close();
    void desktop
      .windowAction(action)
      .catch(() =>
        setError("That window action could not finish. Please try again."),
      );
  };
  return (
    <header
      className="desktop-bar"
      data-focused={state.focused}
      data-platform={state.platform}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) command("maximize");
      }}
    >
      <div className="desktop-menu-anchor">
        <InkButton
          ref={trigger}
          className="desktop-menu-trigger"
          aria-label="LMBook menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp"].includes(event.key)) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <BookOpen size={17} />
          <span>LMBook</span>
          <ChevronDown size={13} />
        </InkButton>
        {open && (
          <div
            ref={menu}
            className="ink-menu"
            role="menu"
            aria-label="LMBook"
            onKeyDown={(event) => {
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role=menuitem]",
                ),
              ];
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                items[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          items.length) %
                        items.length
                ]?.focus();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              } else if (event.key === "Tab") {
                event.preventDefault();
                close();
                if (!event.shiftKey)
                  document
                    .querySelector<HTMLButtonElement>(".desktop-window-button")
                    ?.focus();
              } else if (
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                const next = [
                  ...items.slice(index + 1),
                  ...items.slice(0, index + 1),
                ].find((item) =>
                  item.textContent
                    ?.toLowerCase()
                    .startsWith(event.key.toLowerCase()),
                );
                if (next) {
                  event.preventDefault();
                  next.focus();
                }
              }
            }}
          >
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                onNew();
              }}
            >
              New notebook
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                onSettings();
              }}
            >
              Connections & settings
            </button>
            <hr />
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => command("zoom-in")}
            >
              Zoom in <kbd>+</kbd>
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => command("zoom-out")}
            >
              Zoom out <kbd>−</kbd>
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => command("zoom-reset")}
            >
              Actual size <kbd>100%</kbd>
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => command("fullscreen")}
            >
              {state.fullscreen ? "Leave full screen" : "Full screen"}
              {state.fullscreen && <Check size={15} />}
            </button>
            <hr />
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => command("data-folder")}
            >
              Open data folder
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              onClick={() => command("quit")}
            >
              Quit LMBook
            </button>
          </div>
        )}
      </div>
      <span className="desktop-bar-caption">{title}</span>
      <div className="desktop-window-actions">
        <InkButton
          className="desktop-window-button"
          title="Minimize"
          aria-label="Minimize window"
          onClick={() => command("minimize")}
        >
          <Minus size={16} />
        </InkButton>
        <InkButton
          className="desktop-window-button"
          title={
            state.fullscreen
              ? "Leave full screen"
              : state.maximized
                ? "Restore"
                : "Maximize"
          }
          aria-label={
            state.fullscreen
              ? "Leave full screen"
              : state.maximized
                ? "Restore window"
                : "Maximize window"
          }
          onClick={() => command(state.fullscreen ? "fullscreen" : "maximize")}
        >
          {state.maximized ? <Copy size={13} /> : <Square size={13} />}
        </InkButton>
        <InkButton
          className="desktop-window-button desktop-close"
          title="Close"
          aria-label="Close window"
          onClick={() => command("close")}
        >
          <X size={17} />
        </InkButton>
      </div>
      {error && (
        <div className="desktop-action-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
    </header>
  );
}
