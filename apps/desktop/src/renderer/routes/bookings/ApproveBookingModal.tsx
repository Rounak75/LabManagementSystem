// Phase 3d Plan F — Approve dialog. Handles two flows:
//   1. Normal: pick a phlebotomist → submit.
//   2. Multi-patient: when the patient's phone matches >1 existing record,
//      the IPC returns { kind: "chooser", candidates } and we ask the staff
//      which patient this booking is for (or "a new family member").

import { useEffect, useState } from "react";
import { call } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

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
      <Modal open onClose={() => onClose(true)} title="Booking approved">
        <p className="text-sm text-slate-600">
          {booking.patientName} · {booking.patientPhone}
        </p>
        <div className="mt-3 rounded-md border bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Patient access code</p>
          <p className="mt-1 font-mono text-2xl tracking-widest">{approved.accessCode}</p>
          <p className="mt-1 text-xs text-slate-500">
            Print on the receipt or share with the patient — used to log into the portal.
          </p>
        </div>
        {approved.createdNewPatient && (
          <p className="mt-2 text-xs text-amber-700">
            New patient record created (age/sex unknown — update when the phlebotomist returns).
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => onClose(true)}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={() => onClose(false)} title={`Approve booking ${booking.bookingId}`}>
      <p className="text-sm text-slate-600">
        {booking.patientName} · {booking.patientPhone}
      </p>

      {chooser ? (
        <div className="mt-3">
          <p className="text-sm">
            Multiple patients share this phone number. Which one is this booking for?
          </p>
          <div className="mt-2 space-y-1">
            {chooser.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded border p-2 text-sm hover:bg-slate-50">
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
            <label className="flex items-center gap-2 rounded border p-2 text-sm hover:bg-slate-50">
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
        <div className="mt-3">
          <Select
            label="Assign to phlebotomist"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            <option value="">— unassigned —</option>
            {phlebotomists.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          {phlebotomists.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              No users have "Can collect samples" enabled. Toggle it in User Management to populate this list.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onClose(false)}>Cancel</Button>
        <Button
          onClick={handleApprove}
          disabled={submitting || (chooser !== null && !chosen)}
        >
          {submitting ? "Approving…" : chooser ? "Confirm patient" : "Approve"}
        </Button>
      </div>
    </Modal>
  );
}
