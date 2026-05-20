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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-5 max-w-md w-full">
        <h3 className="font-semibold mb-2">Verify multiple visits</h3>
        <p className="text-sm text-gray-600 mb-3">Only visits with no abnormal values are shown.</p>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-500">No low-risk visits to verify in bulk.</p>
        ) : (
          <ul className="max-h-60 overflow-y-auto divide-y border rounded">
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
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 border rounded py-2 text-sm">Cancel</button>
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
            className="flex-1 bg-green-600 text-white rounded py-2 text-sm font-medium disabled:bg-green-300"
          >
            Verify {selected.length}
          </button>
        </div>
      </div>
    </div>
  );
}
