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
    <li className="px-4 py-3">
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="font-medium">
            {b.patient_name} <span className="text-xs text-gray-500">({b.booking_id})</span>
          </div>
          <div className="text-xs text-gray-500">
            {formatPhone(b.patient_phone ?? "")} · {formatDateShort(b.preferred_date ?? "")} · {b.preferred_slot}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {b.address}
            {b.pincode ? ` (${b.pincode})` : ""}
          </div>
          {b.notes && <div className="text-xs italic mt-1 text-gray-600">&ldquo;{b.notes}&rdquo;</div>}
        </div>
        {b.status === "Pending" && (
          <div className="flex gap-2">
            <button
              onClick={() => setDeclining(true)}
              className="bg-red-100 text-red-700 rounded px-3 py-1 text-sm"
            >
              Decline
            </button>
            <button
              onClick={() => setApproving(true)}
              className="bg-green-600 text-white rounded px-3 py-1 text-sm"
            >
              Approve
            </button>
          </div>
        )}
        {b.status === "Declined" && b.decline_reason && (
          <div className="text-xs text-red-700">Reason: {b.decline_reason}</div>
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
