"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const REASONS = ["Outside service area", "Slot unavailable", "Patient declined", "Other"];

export function DeclineDialog({
  bookingId,
  bookingLabel,
  onClose,
}: {
  bookingId: string;
  bookingLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState(REASONS[0]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-5 max-w-sm w-full">
        <h3 className="font-semibold mb-3">Decline {bookingLabel}</h3>
        <label className="block text-sm mb-3">
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
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border rounded py-2 text-sm">Cancel</button>
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await fetch(`/api/bookings/${bookingId}/decline`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason }),
                });
                if (!r.ok) {
                  setError("Could not decline. Try again.");
                  return;
                }
                router.refresh();
                onClose();
              })
            }
            className="flex-1 bg-red-600 text-white rounded py-2 text-sm font-medium disabled:bg-red-300"
          >
            {pending ? "Declining…" : "Decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
