"use client";

// macOS-dock magnification for the header nav.
//
// Same idea as React Bits' Dock: each item's size follows how close the
// pointer is to its centre, so the one under the cursor swells and its
// neighbours taper off. Two deliberate differences from that component:
//
//  1. It animates `width`/`height`. This animates `transform`, which the
//     compositor handles without a layout pass — the header sits above a
//     scrolling page, and re-laying it out on every pointer move is exactly
//     the sort of thing that drops frames on a mid-range phone.
//  2. No animation library. The falloff curve and the easing are a few lines
//     of arithmetic; pulling in ~34KB for them would be the largest single
//     addition to a bundle patients load on mobile data.

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

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

  return (
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
      className="flex shrink-0 items-center gap-2 sm:gap-3"
    >
      {items.map((item) => (
        <li key={item.href} className={item.primary ? "" : "hidden sm:block"}>
          <Link
            href={item.href}
            className={`dock-item tap inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-semibold sm:text-[13.5px] ${
              item.primary
                ? "bg-white text-brand-deep hover:bg-white/90"
                : "font-medium text-band/70 hover:bg-white/10 hover:text-band"
            }`}
          >
            {item.label}
          </Link>
        </li>
      ))}
      {action && <li>{action}</li>}
    </ul>
  );
}
