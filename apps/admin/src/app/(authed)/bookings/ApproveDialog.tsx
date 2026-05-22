"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Phlebotomist } from "./BookingRow";

export function ApproveDialog({
  bookingId,
  bookingLabel,
  phlebotomists,
  onClose,
}: {
  bookingId: string;
  bookingLabel: string;
  phlebotomists: Phlebotomist[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [assignedTo, setAssignedTo] = useState<string>(phlebotomists[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-5 shadow-xl">
        <h3 className="mb-3 text-base font-bold text-slate-900">Approve {bookingLabel}</h3>
        {phlebotomists.length === 0 ? (
          <p className="mb-3 text-sm text-slate-600">
            No sample collectors are configured. Approve without assignment, then assign later on the desktop.
          </p>
        ) : (
          <label className="mb-3 block">
            <span className="field-label">Assign to phlebotomist</span>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="input mt-1.5"
            >
              {phlebotomists.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="mb-2 text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await fetch(`/api/bookings/${bookingId}/approve`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ assigned_to_user_id: assignedTo || null }),
                });
                if (!r.ok) {
                  setError("Could not approve. Try again.");
                  return;
                }
                router.refresh();
                onClose();
              })
            }
            className="btn-success flex-1"
          >
            {pending ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
