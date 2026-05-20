// Best-effort global error reporter. Mounted via ErrorReporterMount in the
// authed layout. Captures window.onerror + unhandledrejection and POSTs to
// /api/client-errors (which drops anonymous reports).

declare global {
  interface Window {
    __errReporterInstalled?: boolean;
  }
}

export function installErrorReporter(): void {
  if (typeof window === "undefined") return;
  if (window.__errReporterInstalled) return;
  window.__errReporterInstalled = true;

  const report = async (message: string, stack?: string) => {
    try {
      await fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, stack, url: location.href, userAgent: navigator.userAgent }),
        keepalive: true,
      });
    } catch {
      /* swallow — reporting must never throw */
    }
  };

  window.addEventListener("error", (e) => report(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as { stack?: string } | undefined;
    report(String(e.reason), reason?.stack);
  });
}
