"use client";
import { useEffect, useState } from "react";

export interface CriticalFlagDetail {
  delta: number;
}

/** Listens for "critical-flag" CustomEvents dispatched by ParameterCard when a
 *  parameter's severity flips to/from Critical, and shows a sticky banner. */
export function CriticalNotice() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let n = 0;
    const onFlag = (e: Event) => {
      n += (e as CustomEvent<CriticalFlagDetail>).detail.delta;
      if (n < 0) n = 0;
      setCount(n);
    };
    window.addEventListener("critical-flag", onFlag as EventListener);
    return () => window.removeEventListener("critical-flag", onFlag as EventListener);
  }, []);
  if (count === 0) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px h-4 w-4 shrink-0 text-rose-600"
        aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <span>
        {count} critical value{count > 1 ? "s" : ""} entered. An Admin must acknowledge these before verifying.
      </span>
    </div>
  );
}
