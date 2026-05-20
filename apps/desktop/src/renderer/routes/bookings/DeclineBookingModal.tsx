// Phase 3d Plan F — Decline dialog. Reason is required (≥10 chars after trim)
// and stored on the Booking so the status page can show it to the patient.

import { useState } from "react";
import { call } from "@/lib/api";

const PRESET_REASONS = [
  "Outside service area",
  "No phlebotomist available on that date",
  "Patient requested cancellation",
  "Other",
] as const;

interface Booking {
  id: string;
  bookingId: string;
  patientName: string;
  patientPhone: string;
  version: number;
}

export function DeclineBookingModal({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: (refresh: boolean) => void;
}) {
  const [preset, setPreset] = useState<(typeof PRESET_REASONS)[number]>(PRESET_REASONS[0]);
  const [other, setOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalReason = preset === "Other" ? other.trim() : preset;
  const canSubmit = finalReason.length >= 10;

  async function handleDecline() {
    if (!canSubmit) {
      setError("Please provide a reason (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await call("bookings:decline", {
        bookingId: booking.id,
        reason: finalReason,
        expectedVersion: booking.version,
      });
      onClose(true);
    } catch (e: any) {
      setError(e?.message ?? "Could not decline.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-5 rounded shadow-lg w-full max-w-md">
        <h2 className="font-semibold">Decline booking {booking.bookingId}</h2>
        <p className="text-sm text-slate-600 mt-1">
          {booking.patientName} · {booking.patientPhone}
        </p>

        <label className="block mt-3">
          <span className="text-sm font-medium">Reason</span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as (typeof PRESET_REASONS)[number])}
            className="mt-1 block w-full rounded border-slate-300 text-sm"
          >
            {PRESET_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        {preset === "Other" && (
          <textarea
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Tell the patient why (at least 10 characters)"
            rows={3}
            className="mt-2 block w-full rounded border-slate-300 text-sm"
          />
        )}

        <p className="text-xs text-slate-500 mt-2">
          This message is sent to the patient and shown on their status page.
        </p>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-800 text-sm p-2 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => onClose(false)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleDecline}
            disabled={submitting || !canSubmit}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm disabled:opacity-50"
          >
            {submitting ? "Declining…" : "Decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
