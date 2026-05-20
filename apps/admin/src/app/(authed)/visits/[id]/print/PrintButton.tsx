"use client";
import { useTransition, useState } from "react";

export function PrintButton({ visitId, verified }: { visitId: string; verified: boolean }) {
  const [pending, startTransition] = useTransition();
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!verified) return <span className="text-xs text-gray-500">Verify before printing</span>;

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
        className="bg-blue-600 text-white rounded px-3 py-2 text-sm font-medium disabled:bg-blue-300"
      >
        {queued ? "Queued for printing" : pending ? "Queueing…" : "Print"}
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </span>
  );
}
