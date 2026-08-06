// Finishes a booking the staff portal approved but that never became a patient.
//
// The portal writes "Approved" to the cloud; the patient and visit are created
// later, here, by the sync sweep. When more than one patient shares the booking's
// phone the sweep refuses to guess which household member it is — correctly, since
// guessing files one person's results under another's name. But approval had
// already happened, and the desktop's Approve dialog only accepts bookings that
// are still Pending, so there was no way left to answer the question.
//
// This asks it. Unlike the Approve dialog there is no confirmation-call question
// and no phlebotomist picker: both were settled in the portal at approval time,
// and asking again here would record a call nobody was prompted to make.

import { useEffect, useState } from "react";
import { call } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface UnconvertedApproval {
  id: string;
  bookingId: string;
  patientName: string;
  patientPhone: string;
}

interface PatientChoice {
  id: string;
  patientId: string;
  name: string;
  age: number;
  sex: string;
}

type ResolveResult =
  | { kind: "converted"; visitId: string; patientId: string; accessCode: string }
  | { kind: "chooser"; candidates: PatientChoice[] };

export function ResolveBookingModal({
  booking,
  onClose,
}: {
  booking: UnconvertedApproval;
  onClose: (refresh: boolean) => void;
}) {
  const [candidates, setCandidates] = useState<PatientChoice[] | null>(null);
  const [chosen, setChosen] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<ResolveResult, { kind: "converted" }> | null>(null);

  // Asked for with no choice attached, which is how the service is told to hand
  // back the candidates rather than convert.
  useEffect(() => {
    let cancelled = false;
    call<ResolveResult>("bookings:resolveApproved", { bookingId: booking.id })
      .then((r) => {
        if (cancelled) return;
        if (r.kind === "chooser") setCandidates(r.candidates);
        else setDone(r);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Could not load this booking.");
      });
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await call<ResolveResult>("bookings:resolveApproved", {
        bookingId: booking.id,
        chosenPatientId: chosen,
      });
      if (r.kind === "converted") setDone(r);
      else setCandidates(r.candidates);
    } catch (e: any) {
      setError(e?.message ?? "Could not finish this booking.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Modal open onClose={() => onClose(true)} title="Booking completed">
        <p className="text-sm text-slate-600">
          {booking.patientName} · {booking.patientPhone}
        </p>
        <p className="mt-2 text-sm text-slate-700">
          The patient, visit and bill now exist. This booking is no longer waiting.
        </p>
        <div className="mt-3 rounded-md border bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-600">Patient access code</p>
          <p className="mt-1 font-mono text-2xl tracking-widest">{done.accessCode}</p>
          <p className="mt-1 text-xs text-slate-500">
            Print on the receipt or read it out — this is how they sign in to the portal.
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => onClose(true)}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={() => onClose(false)} title={`Finish booking ${booking.bookingId}`}>
      <p className="text-sm text-slate-600">
        {booking.patientName} · {booking.patientPhone}
      </p>

      {candidates ? (
        <div className="mt-3">
          <p className="text-sm">
            More than one patient uses this phone number, so the system would not guess which of
            them this booking is for. Which one is it?
          </p>
          <div className="mt-2 space-y-1">
            {candidates.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 rounded border p-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="resolve-chooser"
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
                name="resolve-chooser"
                value="__new__"
                checked={chosen === "__new__"}
                onChange={(e) => setChosen(e.target.value)}
              />
              <span>A new family member (create a new patient record)</span>
            </label>
          </div>
        </div>
      ) : !error ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : null}

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onClose(false)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting || !chosen}>
          {submitting ? "Finishing…" : "Finish booking"}
        </Button>
      </div>
    </Modal>
  );
}
