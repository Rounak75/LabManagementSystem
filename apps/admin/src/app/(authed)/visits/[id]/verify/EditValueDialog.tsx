"use client";
import { useState, useTransition } from "react";
import { flagValue } from "@lab/types";
import type { VerifyRow } from "./VerifyView";

export function EditValueDialog({
  row,
  patient,
  onClose,
  onSaved,
}: {
  row: VerifyRow;
  patient: { age: number; sex: "Male" | "Female" | "Other" };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(row.value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-5 shadow-xl">
        <h3 className="mb-3 text-base font-bold text-slate-900">Edit {row.parameter.name}</h3>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="input mb-3 text-lg font-semibold"
        />
        {error && <p className="mb-2 text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const p = row.parameter;
                const flag = flagValue(
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
                  patient,
                );
                const body = {
                  id: row.result?.id,
                  visit_test_id: row.visitTestId,
                  parameter_id: row.parameter.id,
                  value,
                  is_abnormal: flag.isAbnormal,
                  version: (row.result?.version ?? 0) + 1,
                };
                const r = await fetch("/api/results/upsert", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                if (!r.ok) {
                  setError(await r.text());
                  return;
                }
                onSaved();
              });
            }}
            className="btn-primary flex-1"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
