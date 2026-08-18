"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";

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
    <Dialog title={`Decline ${bookingLabel}`} onClose={onClose}>
        <label className="mb-3 block">
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
        {error && <p className="mb-2 text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
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
            className="btn-danger flex-1"
          >
            {pending ? "Declining…" : "Decline"}
          </button>
        </div>
    </Dialog>
  );
}
