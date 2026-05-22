"use client";
import { useTransition, useState } from "react";

export function PrintButton({ visitId, verified }: { visitId: string; verified: boolean }) {
  const [pending, startTransition] = useTransition();
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!verified) return <span className="text-xs text-slate-500">Verify before printing</span>;

  return (
    <span>
      <button
        disabled={pending || queued}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await fetch(`/api/visits/${visitId}/print`, { method: "POST" });
            if (r.ok) setQueued(true);
            else setError("Could not queue print.");
          })
        }
        className="btn-ghost"
      >
        {queued ? "Queued for printing" : pending ? "Queueing…" : "Print"}
      </button>
      {error && <span className="ml-2 text-xs font-medium text-rose-600">{error}</span>}
    </span>
  );
}
