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
      <h1 className="page-title mb-1">{patient.name}</h1>
      <p className="mb-4 text-sm text-slate-500">
        {visitIdLabel} · {patient.age}
        {patient.sex[0].toLowerCase()} · {formatPhone(patient.phone)} · {formatDateShort(visitDate)}
      </p>

      {hasCritical && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3.5">
          <p className="mb-2 text-sm font-semibold text-rose-800">⚠ Critical value(s) present. Review carefully.</p>
          <label className="flex items-center gap-2 text-sm font-medium text-rose-900">
            <input type="checkbox" checked={criticalAck} onChange={(e) => setCriticalAck(e.target.checked)} className="h-4 w-4 accent-rose-600" />
            I have reviewed the critical value(s).
          </label>
        </div>
      )}

      <table className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
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
              <tr key={`${r.visitTestId}:${r.parameter.id}:${i}`} className="border-t border-slate-100">
                <td className="px-3 py-2.5">
                  <span className="text-xs text-slate-400">{r.visitTestName}</span>
                  <br />
                  <span className="font-medium text-slate-800">{r.parameter.name}</span>
                </td>
                <td className={`px-3 py-2.5 ${sevClass}`}>{r.value || "—"} {r.parameter.unit ?? ""}</td>
                <td className="px-3 py-2.5 text-slate-500">{rangeFor(r.parameter, patient)}</td>
                <td className="px-3 py-2.5">
                  <button onClick={() => setEditing(r)} className="text-xs font-medium text-brand-700 hover:text-brand-800">Edit</button>
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

      <div className="sticky bottom-0 -mx-4 mt-6 flex gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={() => setSendBack(true)} className="btn flex-1 bg-amber-500 py-3 text-white hover:bg-amber-600">
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
          className="btn-success flex-[2] py-3"
        >
          {pending ? "Verifying…" : "Verify"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}
