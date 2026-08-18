"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack, url: location.href, userAgent: navigator.userAgent }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  // Was on the `gray` ramp with unstyled buttons — the only screen in the app
  // not using slate and the shared `.btn` utilities, so the thing a staff member
  // sees when something breaks looked least like the product. It also offered
  // only "Try again": if the page itself is what is broken, retrying it is a
  // loop, so there is now a way out.
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="page-title">Something went wrong</h1>
      <p className="max-w-md text-sm text-slate-600">
        This page hit an unexpected problem. Nothing you had already saved is affected — results and
        patients are stored as they are entered.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn-ghost">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
