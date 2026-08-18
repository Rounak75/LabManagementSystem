"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TestPicker } from "./TestPicker";
import { CounterPayment } from "./CounterPayment";
import type { CounterPaymentMethod } from "@lab/types";
import { messageForFailure } from "@/lib/api-error-message";

interface Patient {
  id: string;
  name: string;
  patient_id: string | null;
}
interface Test {
  id: string;
  name: string;
  price: number;
}

export function NewVisitForm({ patient, tests }: { patient: Patient | null; tests: Test[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<CounterPaymentMethod>("Cash");

  const total = tests.filter((t) => selected.includes(t.id)).reduce((a, t) => a + Number(t.price), 0);

  if (!patient) {
    // This used to be a red line of text and nothing else. Reached from the
    // dashboard's own "New visit" button, it stranded a staff member with a
    // patient in front of them and no way forward but the browser's back
    // gesture — while holding the patient's name in their head.
    return (
      <div className="card p-6 text-center">
        <h2 className="text-base font-semibold text-slate-900">Which patient is this visit for?</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-600">
          A visit belongs to a patient, so pick them first. Search an existing patient, or register
          someone who has not been to the lab before.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/patients" className="btn-primary">
            Find a patient
          </Link>
          <Link href="/patients/new" className="btn-ghost">
            Register a new patient
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const body = {
          patientId: patient.id,
          visitDate: String(fd.get("visitDate") ?? new Date().toISOString().slice(0, 10)),
          testIds: selected,
          notes: String(fd.get("notes") ?? ""),
          amountPaid,
          ...(amountPaid > 0 ? { paymentMethod } : {}),
        };
        startTransition(async () => {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            setError("No internet — visit creation needs to be online so we can allocate a sequential ID.");
            return;
          }
          try {
            const rid = await fetch("/api/visits/reserve-id", { method: "POST" });
            if (!rid.ok) {
              setError(await messageForFailure(rid, "Could not reserve a visit ID. Try again."));
              return;
            }
            const { allocatedId } = await rid.json();

            const r = await fetch("/api/visits/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, allocatedVisitId: allocatedId }),
            });
            if (!r.ok) {
              setError(await messageForFailure(r, "Could not create this visit. Try again."));
              return;
            }
            const j = await r.json();
            router.push(`/visits/${j.id}`);
          } catch {
            setError("Could not reach the lab server. Check the connection and try again.");
          }
        });
      }}
      className="space-y-4"
    >
      <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
        Patient: <strong>{patient.name}</strong> · {patient.patient_id ?? patient.id}
      </div>
      <label className="block">
        <span className="field-label">Visit date</span>
        <input
          name="visitDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="input"
        />
      </label>
      <TestPicker tests={tests} selected={selected} setSelected={setSelected} />
      <CounterPayment
        total={total}
        amountPaid={amountPaid}
        setAmountPaid={setAmountPaid}
        method={paymentMethod}
        setMethod={setPaymentMethod}
      />
      <label className="block">
        <span className="field-label">Notes (optional)</span>
        <textarea name="notes" rows={2} className="input" />
      </label>
      {/* Sticky, like the results form's finishing action. This one sat at the
          natural end of the page, so after tests, payment and notes it was
          below the fold — the two flows a staff member uses most had opposite
          finishing gestures. The negative margins step with the shell's own
          `sm:px-6 md:px-8` inset; a flat `-mx-4` under-bleeds above 640px. */}
      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}
        {selected.length === 0 && (
          <p className="text-xs font-medium text-slate-600">Pick at least one test to create the visit.</p>
        )}
        <button
          type="submit"
          disabled={pending || selected.length === 0}
          className="btn-primary w-full py-3"
        >
          {pending ? "Creating…" : "Create visit"}
        </button>
      </div>
    </form>
  );
}
