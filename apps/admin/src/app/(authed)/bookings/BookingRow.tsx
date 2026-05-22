"use client";
import { useState } from "react";
import { formatPhone, formatDateShort } from "@/lib/format";
import { ApproveDialog } from "./ApproveDialog";
import { DeclineDialog } from "./DeclineDialog";

export interface Phlebotomist {
  id: string;
  name: string;
}

export function BookingRow({
  booking,
  phlebotomists,
}: {
  booking: Record<string, unknown>;
  phlebotomists: Phlebotomist[];
}) {
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const b = booking as Record<string, string | null>;

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">
            {b.patient_name} <span className="text-xs font-normal text-slate-400">({b.booking_id})</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {formatPhone(b.patient_phone ?? "")} · {formatDateShort(b.preferred_date ?? "")} · {b.preferred_slot}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {b.address}
            {b.pincode ? ` (${b.pincode})` : ""}
          </div>
          {b.notes && <div className="mt-1 text-xs italic text-slate-600">&ldquo;{b.notes}&rdquo;</div>}
        </div>
        {b.status === "Pending" && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setDeclining(true)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
            >
              Decline
            </button>
            <button onClick={() => setApproving(true)} className="btn-success px-3 py-1.5">
              Approve
            </button>
          </div>
        )}
        {b.status === "Declined" && b.decline_reason && (
          <div className="shrink-0 text-xs text-rose-700">Reason: {b.decline_reason}</div>
        )}
      </div>
      {approving && (
        <ApproveDialog
          bookingId={b.id as string}
          bookingLabel={b.booking_id as string}
          phlebotomists={phlebotomists}
          onClose={() => setApproving(false)}
        />
      )}
      {declining && (
        <DeclineDialog
          bookingId={b.id as string}
          bookingLabel={b.booking_id as string}
          onClose={() => setDeclining(false)}
        />
      )}
    </li>
  );
}
