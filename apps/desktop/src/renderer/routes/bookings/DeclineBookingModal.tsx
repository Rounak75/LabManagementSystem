// Phase 3d Plan F — Decline dialog. Reason is required (≥10 chars after trim)
// and stored on the Booking so the status page can show it to the patient.

import { useState } from "react";
import { call } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

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
    <Modal open onClose={() => onClose(false)} title={`Decline booking ${booking.bookingId}`}>
      <p className="text-sm text-slate-600">
        {booking.patientName} · {booking.patientPhone}
      </p>

      <div className="mt-3">
        <Select
          label="Reason"
          value={preset}
          onChange={(e) => setPreset(e.target.value as (typeof PRESET_REASONS)[number])}
        >
          {PRESET_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
      </div>

      {preset === "Other" && (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Tell the patient why (at least 10 characters)"
          rows={3}
          className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      )}

      <p className="mt-2 text-xs text-slate-500">
        This message is sent to the patient and shown on their status page.
      </p>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onClose(false)}>Cancel</Button>
        <Button variant="danger" onClick={handleDecline} disabled={submitting || !canSubmit}>
          {submitting ? "Declining…" : "Decline"}
        </Button>
      </div>
    </Modal>
  );
}
