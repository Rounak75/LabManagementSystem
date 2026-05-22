"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface BatchCandidate {
  id: string;
  visit_id: string;
  patientName: string;
}

export function BatchVerifyDialog({
  candidates,
  onClose,
}: {
  candidates: BatchCandidate[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(candidates.map((c) => c.id));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-5 shadow-xl">
        <h3 className="mb-2 text-base font-bold text-slate-900">Verify multiple visits</h3>
        <p className="mb-3 text-sm text-slate-600">Only visits with no abnormal values are shown.</p>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">No low-risk visits to verify in bulk.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {candidates.map((c) => (
              <li key={c.id} className="px-3 py-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() =>
                    setSelected(
                      selected.includes(c.id) ? selected.filter((x) => x !== c.id) : [...selected, c.id],
                    )
                  }
                />
                <span className="text-sm">
                  {c.patientName} <span className="text-gray-500">({c.visit_id})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            disabled={pending || selected.length === 0}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await fetch("/api/visits/batch-verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: selected }),
                });
                if (!r.ok) {
                  setError("Batch verify failed. Try again.");
                  return;
                }
                router.refresh();
                onClose();
              })
            }
            className="btn-success flex-1"
          >
            Verify {selected.length}
          </button>
        </div>
      </div>
    </div>
  );
}
