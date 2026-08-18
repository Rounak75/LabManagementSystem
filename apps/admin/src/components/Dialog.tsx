"use client";
import { ReactNode, useEffect, useRef } from "react";

/** Everything inside the dialog a keyboard can land on, in DOM order. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * The scrim, the panel, and the keyboard contract every dialog in this app
 * needs and none of them had.
 *
 * The six dialogs here — Approve, Decline, BatchVerify, MarkPaid, EditValue,
 * SendBack — each hand-rolled a scrim and a card with no `role`, no focus move
 * on open, no trap, no Escape and no focus restore. Tab walked straight out of
 * the dialog into the page behind the scrim, and a keyboard user could operate
 * controls they could not see.
 *
 * The behaviour below is the desktop app's `ui/Modal`, which already solved
 * this properly. It is duplicated rather than shared because the two apps have
 * no common component package; if one is ever created, these should converge.
 */
export function Dialog({
  title,
  onClose,
  children,
  maxWidth = "max-w-sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Where focus came from, so it can be put back. Without this a keyboard
    // user who closes a dialog is returned to the top of the document and has
    // to tab all the way back to the row they were working on.
    const opener = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Focus the first control, or the panel itself when the dialog is only
    // text — otherwise focus stays on the page behind the scrim.
    (focusables()[0] ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`card w-full ${maxWidth} p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-bold text-slate-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}
