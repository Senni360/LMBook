import { useEffect, useRef, useState } from "react";

/** A single top-layer tooltip serves all shared controls, including modal controls. */
export function InkTooltip() {
  const tip = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let owner: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      tip.current?.hidePopover();
      owner = null;
    };
    const show = (event: Event) => {
      const target = (event.target as Element).closest<HTMLElement>(
        "[data-ink-tooltip]",
      );
      if (!target || target === owner) return;
      hide();
      owner = target;
      timer = setTimeout(
        () => {
          const popup = tip.current;
          if (!popup || !target.isConnected) return;
          setText(target.dataset.inkTooltip || "");
          popup.textContent = target.dataset.inkTooltip || "";
          popup.showPopover();
          const box = target.getBoundingClientRect();
          const size = popup.getBoundingClientRect();
          popup.style.left = `${Math.max(8, Math.min(innerWidth - size.width - 8, box.left + box.width / 2 - size.width / 2))}px`;
          popup.style.top = `${box.bottom + size.height + 12 < innerHeight ? box.bottom + 8 : Math.max(8, box.top - size.height - 8)}px`;
        },
        event.type === "focusin" ? 250 : 500,
      );
    };
    const leave = (event: Event) => {
      const next = (event as MouseEvent).relatedTarget as Node | null;
      if (!owner?.contains(next) && !tip.current?.contains(next)) hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusout", leave);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);
  return (
    <div
      ref={tip}
      popover="manual"
      role="tooltip"
      className="ink-tooltip"
      aria-hidden="true"
    >
      {text}
    </div>
  );
}
