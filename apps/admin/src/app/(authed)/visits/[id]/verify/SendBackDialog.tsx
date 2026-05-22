"use client";
import { useState, useTransition } from "react";

const REASONS = ["Value seems wrong", "Sample needs rerun", "Patient info incorrect", "Other"];

export function SendBackDialog({
  visitId,
  onClose,
  onSent,
}: {
  visitId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-5 shadow-xl">
        <h3 className="mb-3 text-base font-bold text-slate-900">Send back to staff</h3>
        <label className="mb-2 block">
          <span className="field-label">Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input mt-1.5"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="field-label">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="input mt-1.5"
          />
        </label>
        {error && <p className="mb-2 text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await fetch(`/api/visits/${visitId}/send-back`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason, note }),
                });
                if (!r.ok) {
                  setError(await r.text());
                  return;
                }
                onSent();
              });
            }}
            className="btn flex-1 bg-amber-500 text-white hover:bg-amber-600"
          >
            {pending ? "Sending…" : "Send back"}
          </button>
        </div>
      </div>
    </div>
  );
}
