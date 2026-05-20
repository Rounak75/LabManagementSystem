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
    <div className="bg-red-100 border-l-4 border-red-600 text-red-900 px-4 py-2 text-sm mb-4">
      ⚠ {count} critical value{count > 1 ? "s" : ""} entered. Father will be required to acknowledge before verifying.
    </div>
  );
}
