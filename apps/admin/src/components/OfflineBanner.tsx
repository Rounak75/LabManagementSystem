"use client";
import { useEffect, useState } from "react";
import { listPending, dequeueOne, markSent, markError } from "@/lib/offline-queue";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = async () => setPending((await listPending()).length);
    refresh();
    const onOnline = async () => {
      setOnline(true);
      await flush();
      refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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
    <div className={online ? "bg-yellow-100 text-yellow-900" : "bg-red-100 text-red-900"}>
      <div className="max-w-4xl mx-auto px-4 py-2 text-sm">
        {!online && <span>You are offline. </span>}
        {pending > 0 && <span>{pending} item{pending > 1 ? "s" : ""} waiting to sync.</span>}
      </div>
    </div>
  );
}
