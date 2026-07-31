"use client";

// The header navigation, in two forms.
//
// On a pointer device it is a dock: each item's size follows how close the
// cursor is to its centre, so the one under it swells and its neighbours
// taper off. Same idea as React Bits' Dock, with two deliberate differences —
// it animates `transform` rather than `width`/`height`, so the compositor
// handles it without a layout pass, and the falloff curve is a few lines of
// arithmetic rather than ~34KB of animation library on a bundle patients load
// over mobile data.
//
// On a phone there is no room for five items, so the links move into a menu
// that drops out of the header. Sign in stays on the bar — it is the reason
// most people arrive, and burying the primary action behind a tap is the
// usual way these menus go wrong.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export interface DockItem {
  href: string;
  label: string;
  /** The white pill — visually the primary action, same rhythm as the rest. */
  primary?: boolean;
}

/** Scale of the item directly under the pointer. */
const MAX_SCALE = 1.22;
/** How far either side, in px, an item still feels the pointer. */
const FALLOFF = 120;
/** How far the fully-magnified item rises. */
const LIFT = 4;

export function NavDock({
  items,
  action,
}: {
  items: DockItem[];
  /** Trailing control — the theme toggle. Anything carrying `.dock-item`
   *  joins the magnification automatically. */
  action?: React.ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // Collected from the DOM rather than per-child refs, so a slot passed in
  // from outside magnifies on the same terms as the links.
  const nodes = useRef<HTMLElement[]>([]);
  // Centres are cached on entry rather than measured per move: a
  // getBoundingClientRect per item per pointermove is a forced reflow each
  // time, and transforms don't move the untransformed layout box anyway.
  const centres = useRef<number[]>([]);
  const frame = useRef<number | null>(null);
  const active = useRef(false);

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const primary = items.find((i) => i.primary);
  const secondary = items.filter((i) => !i.primary);

  const paint = useCallback((pointerX: number | null) => {
    nodes.current.forEach((el, i) => {
      if (pointerX === null) {
        el.style.transform = "";
        return;
      }
      const distance = Math.abs(pointerX - (centres.current[i] ?? Infinity));
      const t = Math.max(0, 1 - distance / FALLOFF);
      // Smoothstep: eases in and out of the falloff so the swell reads as a
      // curve rather than a cone. This is what makes it feel like a dock.
      const e = t * t * (3 - 2 * t);
      const scale = 1 + (MAX_SCALE - 1) * e;
      el.style.transform = `translateY(${(-LIFT * e).toFixed(2)}px) scale(${scale.toFixed(3)})`;
    });
  }, []);

  /** Must run while nothing is transformed, or the centres drift. */
  const measure = useCallback(() => {
    const root = listRef.current;
    if (!root) return;
    nodes.current = Array.from(root.querySelectorAll<HTMLElement>(".dock-item"));
    centres.current = nodes.current.map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
  }, []);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      active.current = fine.matches && !still.matches;
      if (!active.current) paint(null);
    };
    sync();
    fine.addEventListener("change", sync);
    still.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      still.removeEventListener("change", sync);
    };
  }, [paint]);

  // Arriving somewhere new closes the menu — otherwise it hangs over the page
  // the patient just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function handleMove(e: React.PointerEvent<HTMLUListElement>) {
    if (!active.current) return;
    const x = e.clientX;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      paint(x);
    });
  }

  function handleEnter() {
    if (!active.current) return;
    measure();
  }

  function handleLeave() {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    paint(null);
  }

  // Keyboard users get the same feedback: focusing an item magnifies it.
  function handleFocus(e: React.FocusEvent<HTMLUListElement>) {
    if (!active.current) return;
    measure();
    const i = nodes.current.indexOf(e.target as HTMLElement);
    paint(i === -1 ? null : (centres.current[i] ?? null));
  }

  const linkCls = (item: DockItem) =>
    `dock-item tap inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-semibold sm:text-[13.5px] ${
      item.primary
        ? "bg-white text-brand-deep hover:bg-white/90"
        : "font-medium text-band/70 hover:bg-white/10 hover:text-band"
    }`;

  return (
    <div ref={menuRef} className="relative flex w-full items-center justify-center">
      {/* ─── Pointer devices: the dock ──────────────────────────────── */}
      <ul
        ref={listRef}
        onPointerMove={handleMove}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        onFocus={handleFocus}
        onBlur={handleLeave}
        // One gap and one padding for every item, the sign-in pill and the
        // theme toggle included, so the spacing between any two neighbours is
        // identical.
        className="hidden shrink-0 items-center gap-2 sm:flex sm:gap-3"
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={linkCls(item)}>
              {item.label}
            </Link>
          </li>
        ))}
        {action && <li>{action}</li>}
      </ul>

      {/* ─── Phones: menu button, and the primary action kept in view ── */}
      <div className="flex w-full items-center justify-between sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="portal-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="tap inline-flex h-11 w-11 items-center justify-center rounded-full text-band hover:bg-white/10"
        >
          <Burger open={open} />
        </button>

        {primary && (
          <Link href={primary.href} className={linkCls(primary)}>
            {primary.label}
          </Link>
        )}
      </div>

      {/* ─── The menu itself ────────────────────────────────────────── */}
      {open && (
        <div
          id="portal-menu"
          className="band pop absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl shadow-lift ring-1 ring-inset ring-white/15 sm:hidden"
        >
          <ul className="p-2">
            {secondary.map((item, i) => (
              <li
                key={item.href}
                className="rise"
                style={{ "--i": i } as React.CSSProperties}
              >
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="tap block rounded-xl px-4 py-3 text-[14.5px] font-medium text-band/85 hover:bg-white/10 hover:text-band"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          {action && (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
              <span className="text-[13px] text-band/60">Appearance</span>
              {action}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Three lines that fold into a cross rather than swapping for one. */
function Burger({ open }: { open: boolean }) {
  const bar =
    "absolute left-0 block h-[1.5px] w-full rounded-full bg-current transition-all duration-300 ease-out-fluid";
  return (
    <span aria-hidden className="relative block h-[14px] w-[19px]">
      <span className={`${bar} ${open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"}`} />
      <span
        className={`${bar} top-1/2 -translate-y-1/2 ${open ? "opacity-0" : "opacity-100"}`}
      />
      <span className={`${bar} ${open ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0 top-auto"}`} />
    </span>
  );
}
