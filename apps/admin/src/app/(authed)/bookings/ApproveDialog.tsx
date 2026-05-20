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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-5 max-w-sm w-full">
        <h3 className="font-semibold mb-3">Approve {bookingLabel}</h3>
        {phlebotomists.length === 0 ? (
          <p className="text-sm text-gray-600 mb-3">
            No sample collectors are configured. Approve without assignment, then assign later on the desktop.
          </p>
        ) : (
          <label className="block text-sm mb-3">
            Assign to phlebotomist
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full border rounded px-3 py-2 mt-1"
            >
              {phlebotomists.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border rounded py-2 text-sm">Cancel</button>
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
            className="flex-1 bg-green-600 text-white rounded py-2 text-sm font-medium disabled:bg-green-300"
          >
            {pending ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
