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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-5 max-w-sm w-full">
        <h3 className="font-semibold mb-2">Send back to staff</h3>
        <label className="block text-sm mb-2">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm mb-3">
          Note (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border rounded py-2 text-sm">Cancel</button>
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
            className="flex-1 bg-yellow-600 text-white rounded py-2 text-sm font-medium disabled:bg-yellow-300"
          >
            {pending ? "Sending…" : "Send back"}
          </button>
        </div>
      </div>
    </div>
  );
}
