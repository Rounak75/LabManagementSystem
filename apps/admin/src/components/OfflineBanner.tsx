"use client";
import { useEffect, useState } from "react";
import { listPending, dequeueOne, markSent, markError } from "@/lib/offline-queue";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = async () => setPending((await listPending()).length);

    const flushThenRefresh = async () => {
      if (!navigator.onLine) return;
      await flush();
      await refresh();
    };

    // Flush on mount, not only when the browser reports a connection coming
    // back. Staff type results on a phone that loses signal, then close the tab
    // or let it sleep; when the portal is opened again the device is already
    // online, so the "online" event never fires. Those results sat in the queue
    // indefinitely, counted in "waiting to sync" and never sent — the exact case
    // this queue exists for.
    setOnline(navigator.onLine);
    refresh();
    void flushThenRefresh();

    const onOnline = async () => {
      setOnline(true);
      await flushThenRefresh();
    };
    const onOffline = () => setOnline(false);
    // A phone browser suspends timers and events in a backgrounded tab; coming
    // back to the app is the other moment worth retrying on.
    const onVisible = () => {
      if (document.visibilityState === "visible") void flushThenRefresh();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  async function flush() {
    for (;;) {
      const item = await dequeueOne();
      if (!item) break;
      try {
        const endpoint =
          item.kind === "patient.create" ? "/api/patients/create" :
          item.kind === "result.upsert" ? "/api/queue/sync" : null;
        if (!endpoint) {
          await markSent(item.id);
          continue;
        }
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });
        if (!r.ok) throw new Error(await r.text());
        await markSent(item.id);
      } catch (e: unknown) {
        await markError(item.id, e instanceof Error ? e.message : "unknown");
        break;
      }
    }
  }

  if (online && pending === 0) return null;
  return (
    <div className={online ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900"}>
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-sm font-medium">
        <span className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-amber-500" : "bg-rose-500"}`} />
        {!online && <span>You are offline — changes are saved on this device.</span>}
        {pending > 0 && <span>{pending} item{pending > 1 ? "s" : ""} waiting to sync.</span>}
      </div>
    </div>
  );
}
