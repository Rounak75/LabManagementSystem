"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack, url: location.href, userAgent: navigator.userAgent }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-gray-800">Something went wrong</h1>
      <p className="max-w-md text-gray-500">
        We hit an unexpected problem loading this page. Please try again.
      </p>
      <button onClick={reset} className="rounded-md bg-gray-800 px-4 py-2 text-white hover:bg-gray-700">
        Try again
      </button>
    </div>
  );
}
