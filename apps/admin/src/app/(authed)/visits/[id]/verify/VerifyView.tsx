"use client";
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { flagValue, FlagSeverity } from "@lab/types";
import type { ResultParameter, ResultRow } from "@/lib/data-results";
import { EditValueDialog } from "./EditValueDialog";
import { SendBackDialog } from "./SendBackDialog";
import { formatDateShort, formatPhone } from "@/lib/format";

interface Patient {
  name: string;
  phone: string;
  age: number;
  sex: "Male" | "Female" | "Other";
}
interface FormVisitTest {
  id: string;
  test_id: string;
  testName: string;
}
export interface VerifyRow {
  visitTestName: string;
  visitTestId: string;
  parameter: ResultParameter;
  result?: ResultRow;
  value: string;
  severity: FlagSeverity;
}

function rangeFor(p: ResultParameter, patient: Patient): string {
  if (patient.age < 13) return `${p.ref_range_child_min ?? "—"}–${p.ref_range_child_max ?? "—"}`;
  if (patient.sex === "Female") return `${p.ref_range_female_min ?? "—"}–${p.ref_range_female_max ?? "—"}`;
  return `${p.ref_range_male_min ?? "—"}–${p.ref_range_male_max ?? "—"}`;
}

export function VerifyView({
  visitId,
  visitIdLabel,
  visitDate,
  patient,
  visitTests,
  parameters,
  results,
}: {
  visitId: string;
  visitIdLabel: string;
  visitDate: string;
  patient: Patient;
  visitTests: FormVisitTest[];
  parameters: ResultParameter[];
  results: ResultRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [criticalAck, setCriticalAck] = useState(false);
  const [editing, setEditing] = useState<VerifyRow | null>(null);
  const [sendBack, setSendBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo<VerifyRow[]>(() => {
    const flat: VerifyRow[] = [];
    for (const vt of visitTests) {
      const params = parameters
        .filter((p) => p.test_id === vt.test_id)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      for (const p of params) {
        const r = results.find((rr) => rr.parameter_id === p.id && rr.visit_test_id === vt.id);
        const value = r?.value ?? "";
        const f = flagValue(
          value,
          {
            resultType: (p.result_type ?? "Numeric") as "Numeric" | "Qualitative",
            refRangeMaleMin: p.ref_range_male_min,
            refRangeMaleMax: p.ref_range_male_max,
            refRangeFemaleMin: p.ref_range_female_min,
            refRangeFemaleMax: p.ref_range_female_max,
            refRangeChildMin: p.ref_range_child_min,
            refRangeChildMax: p.ref_range_child_max,
            qualitativeOptions: p.qualitative_options,
            normalQualitative: p.normal_qualitative,
          },
          { age: patient.age, sex: patient.sex },
        );
        flat.push({ visitTestName: vt.testName, visitTestId: vt.id, parameter: p, result: r, value, severity: f.severity });
      }
    }
    const order: Record<FlagSeverity, number> = {
      [FlagSeverity.Critical]: 0,
      [FlagSeverity.High]: 1,
      [FlagSeverity.Low]: 2,
      [FlagSeverity.Normal]: 3,
    };
    return flat.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [visitTests, parameters, results, patient]);

  const hasCritical = rows.some((r) => r.severity === FlagSeverity.Critical);
  const verifyDisabled = pending || (hasCritical && !criticalAck);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">{patient.name}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {visitIdLabel} · {patient.age}
        {patient.sex[0].toLowerCase()} · {formatPhone(patient.phone)} · {formatDateShort(visitDate)}
      </p>

      {hasCritical && (
        <div className="bg-red-50 border border-red-300 rounded p-3 mb-4">
          <p className="text-sm font-medium text-red-800 mb-2">⚠ Critical value(s) present. Review carefully.</p>
          <label className="flex items-center gap-2 text-sm text-red-900">
            <input type="checkbox" checked={criticalAck} onChange={(e) => setCriticalAck(e.target.checked)} />
            I have reviewed the critical value(s).
          </label>
        </div>
      )}

      <table className="w-full bg-white rounded border text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-3 py-2">Parameter</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Range</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const sevClass =
              r.severity === FlagSeverity.Critical ? "text-red-700 font-bold" :
              r.severity === FlagSeverity.High ? "text-orange-600 font-semibold" :
              r.severity === FlagSeverity.Low ? "text-orange-600 font-semibold" :
              "";
            return (
              <tr key={`${r.visitTestId}:${r.parameter.id}:${i}`} className="border-t">
                <td className="px-3 py-2">
                  <span className="text-gray-500 text-xs">{r.visitTestName}</span>
                  <br />
                  {r.parameter.name}
                </td>
                <td className={`px-3 py-2 ${sevClass}`}>{r.value || "—"} {r.parameter.unit ?? ""}</td>
                <td className="px-3 py-2 text-gray-500">{rangeFor(r.parameter, patient)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => setEditing(r)} className="text-blue-600 text-xs hover:underline">Edit</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && (
        <EditValueDialog
          row={editing}
          patient={patient}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {sendBack && (
        <SendBackDialog
          visitId={visitId}
          onClose={() => setSendBack(false)}
          onSent={() => {
            setSendBack(false);
            router.push("/dashboard");
          }}
        />
      )}

      <div className="sticky bottom-0 bg-white border-t -mx-4 px-4 py-3 mt-6 flex gap-2">
        <button onClick={() => setSendBack(true)} className="flex-1 bg-yellow-500 text-white rounded py-3 font-medium">
          Send back
        </button>
        <button
          disabled={verifyDisabled}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await fetch(`/api/visits/${visitId}/verify`, { method: "POST" });
              if (!r.ok) {
                setError("Verify failed. Try again.");
                return;
              }
              router.push("/dashboard");
              router.refresh();
            });
          }}
          className="flex-[2] bg-green-600 text-white rounded py-3 font-semibold disabled:bg-green-300"
        >
          {pending ? "Verifying…" : "Verify"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
