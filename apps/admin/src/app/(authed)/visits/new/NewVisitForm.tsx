"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TestPicker } from "./TestPicker";

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

  if (!patient) {
    return <p className="text-red-600 text-sm">No patient selected. Open a patient and tap &ldquo;New visit&rdquo;.</p>;
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
        };
        startTransition(async () => {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            setError("No internet — visit creation needs to be online so we can allocate a sequential ID.");
            return;
          }
          try {
            const rid = await fetch("/api/visits/reserve-id", { method: "POST" });
            if (!rid.ok) throw new Error("Could not reserve a visit ID. Try again.");
            const { allocatedId } = await rid.json();

            const r = await fetch("/api/visits/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, allocatedVisitId: allocatedId }),
            });
            if (!r.ok) throw new Error(await r.text());
            const j = await r.json();
            router.push(`/visits/${j.id}`);
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed");
          }
        });
      }}
      className="space-y-4"
    >
      <div className="text-sm text-gray-700">
        Patient: <strong>{patient.name}</strong> · {patient.patient_id ?? patient.id}
      </div>
      <label className="block">
        <span className="text-sm font-medium block mb-1">Visit date</span>
        <input
          name="visitDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="w-full border rounded px-3 py-2"
        />
      </label>
      <TestPicker tests={tests} selected={selected} setSelected={setSelected} />
      <label className="block">
        <span className="text-sm font-medium block mb-1">Notes (optional)</span>
        <textarea name="notes" rows={2} className="w-full border rounded px-3 py-2" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || selected.length === 0}
        className="bg-blue-600 text-white rounded px-4 py-2 font-medium disabled:bg-blue-300"
      >
        {pending ? "Creating…" : "Create visit"}
      </button>
    </form>
  );
}
