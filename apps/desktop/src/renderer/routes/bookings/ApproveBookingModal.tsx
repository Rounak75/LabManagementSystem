// Phase 3d Plan F — Approve dialog. Handles two flows:
//   1. Normal: pick a phlebotomist → submit.
//   2. Multi-patient: when the patient's phone matches >1 existing record,
//      the IPC returns { kind: "chooser", candidates } and we ask the staff
//      which patient this booking is for (or "a new family member").

import { useEffect, useState } from "react";
import { call } from "@/lib/api";

interface Booking {
  id: string;
  bookingId: string;
  patientName: string;
  patientPhone: string;
  version: number;
}

interface Phlebotomist { id: string; name: string; }
interface PatientChoice {
  id: string;
  patientId: string;
  name: string;
  age: number;
  sex: string;
}

type ApproveResult =
  | { kind: "approved"; visitId: string; patientId: string; accessCode: string; createdNewPatient: boolean }
  | { kind: "chooser"; candidates: PatientChoice[] };

export function ApproveBookingModal({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: (refresh: boolean) => void;
}) {
  const [phlebotomists, setPhlebotomists] = useState<Phlebotomist[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [chooser, setChooser] = useState<PatientChoice[] | null>(null);
  const [chosen, setChosen] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<Extract<ApproveResult, { kind: "approved" }> | null>(null);

  useEffect(() => {
    call<Phlebotomist[]>("bookings:listPhlebotomists").then((rows) => {
      setPhlebotomists(rows);
      if (rows[0]) setAssignedTo(rows[0].id);
    });
  }, []);

  async function handleApprove() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await call<ApproveResult>("bookings:approve", {
        bookingId: booking.id,
        assignedToUserId: assignedTo || null,
        chosenPatientId: chosen || null,
        expectedVersion: booking.version,
      });
      if (result.kind === "chooser") {
        setChooser(result.candidates);
        return;
      }
      setApproved(result);
    } catch (e: any) {
      setError(e?.message ?? "Could not approve.");
    } finally {
      setSubmitting(false);
    }
  }

  if (approved) {
    return (
      <Modal>
        <h2 className="font-semibold text-base">Booking approved</h2>
        <p className="text-sm text-slate-600 mt-1">
          {booking.patientName} · {booking.patientPhone}
        </p>
        <div className="mt-3 bg-slate-50 border rounded p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Patient access code</p>
          <p className="font-mono text-2xl tracking-widest mt-1">{approved.accessCode}</p>
          <p className="text-xs text-slate-500 mt-1">
            Print on the receipt or share with the patient — used to log into the portal.
          </p>
        </div>
        {approved.createdNewPatient && (
          <p className="text-xs text-amber-700 mt-2">
            New patient record created (age/sex unknown — update when the phlebotomist returns).
          </p>
        )}
        <div className="flex justify-end mt-4">
          <button
            onClick={() => onClose(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal>
      <h2 className="font-semibold">Approve booking {booking.bookingId}</h2>
      <p className="text-sm text-slate-600 mt-1">
        {booking.patientName} · {booking.patientPhone}
      </p>

      {chooser ? (
        <div className="mt-3">
          <p className="text-sm">
            Multiple patients share this phone number. Which one is this booking for?
          </p>
          <div className="mt-2 space-y-1">
            {chooser.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm border rounded p-2 hover:bg-slate-50">
                <input
                  type="radio"
                  name="chooser"
                  value={c.id}
                  checked={chosen === c.id}
                  onChange={(e) => setChosen(e.target.value)}
                />
                <span className="flex-1">
                  {c.name} <span className="text-slate-500">· {c.age}y · {c.sex}</span>
                </span>
                <span className="font-mono text-xs text-slate-500">{c.patientId}</span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm border rounded p-2 hover:bg-slate-50">
              <input
                type="radio"
                name="chooser"
                value="__new__"
                checked={chosen === "__new__"}
                onChange={(e) => setChosen(e.target.value)}
              />
              <span>A new family member (create new patient record)</span>
            </label>
          </div>
        </div>
      ) : (
        <label className="block mt-3">
          <span className="text-sm font-medium">Assign to phlebotomist</span>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="mt-1 block w-full rounded border-slate-300 text-sm"
          >
            <option value="">— unassigned —</option>
            {phlebotomists.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {phlebotomists.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">
              No users have "Can collect samples" enabled. Toggle it in User Management to populate this list.
            </p>
          )}
        </label>
      )}

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
          onClick={handleApprove}
          disabled={submitting || (chooser !== null && !chosen)}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50"
        >
          {submitting ? "Approving…" : chooser ? "Confirm patient" : "Approve"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-5 rounded shadow-lg w-full max-w-md">{children}</div>
    </div>
  );
}
