"use client";
import { useEffect, useRef, useState } from "react";
import { flagValue, FlagSeverity } from "@lab/types";
import type { ResultParameter } from "@/lib/data-results";
import { enqueue } from "@/lib/offline-queue";

const DEBOUNCE_MS = 500;

function rangeOf(parameter: ResultParameter, patient: { age: number; sex: "Male" | "Female" | "Other" }) {
  if (patient.age < 13) return `${parameter.ref_range_child_min ?? "—"}–${parameter.ref_range_child_max ?? "—"}`;
  if (patient.sex === "Female") return `${parameter.ref_range_female_min ?? "—"}–${parameter.ref_range_female_max ?? "—"}`;
  return `${parameter.ref_range_male_min ?? "—"}–${parameter.ref_range_male_max ?? "—"}`;
}

function parseQualitativeOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function ParameterCard({
  visitTestId,
  parameter,
  patient,
  initialValue,
  initialResultId,
  initialVersion,
}: {
  visitTestId: string;
  parameter: ResultParameter;
  patient: { age: number; sex: "Male" | "Female" | "Other" };
  initialValue: string;
  initialResultId?: string;
  initialVersion?: number;
}) {
  const [value, setValue] = useState(initialValue);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savingError, setSavingError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the persisted id/version so subsequent edits update the same row
  // rather than inserting duplicates.
  const resultId = useRef<string | undefined>(initialResultId);
  const version = useRef<number>(initialVersion ?? 0);
  const wasCritical = useRef(false);

  const flag = flagValue(
    value,
    {
      resultType: (parameter.result_type ?? "Numeric") as "Numeric" | "Qualitative",
      refRangeMaleMin: parameter.ref_range_male_min,
      refRangeMaleMax: parameter.ref_range_male_max,
      refRangeFemaleMin: parameter.ref_range_female_min,
      refRangeFemaleMax: parameter.ref_range_female_max,
      refRangeChildMin: parameter.ref_range_child_min,
      refRangeChildMax: parameter.ref_range_child_max,
      qualitativeOptions: parameter.qualitative_options,
      normalQualitative: parameter.normal_qualitative,
    },
    patient,
  );

  // Notify CriticalNotice when this card's severity crosses the Critical boundary.
  useEffect(() => {
    const isCritical = flag.severity === FlagSeverity.Critical;
    if (isCritical !== wasCritical.current) {
      window.dispatchEvent(new CustomEvent("critical-flag", { detail: { delta: isCritical ? 1 : -1 } }));
      wasCritical.current = isCritical;
    }
  }, [flag.severity]);

  useEffect(() => {
    return () => {
      // On unmount, retract any outstanding critical contribution.
      if (wasCritical.current) {
        window.dispatchEvent(new CustomEvent("critical-flag", { detail: { delta: -1 } }));
      }
    };
  }, []);

  useEffect(() => {
    if (value === initialValue && resultId.current === initialResultId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const nextVersion = version.current + 1;
      const body = {
        id: resultId.current,
        visit_test_id: visitTestId,
        parameter_id: parameter.id,
        value,
        is_abnormal: flag.isAbnormal,
        version: nextVersion,
      };
      try {
        const r = await fetch("/api/results/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(await r.text());
        const j = (await r.json()) as { id: string };
        resultId.current = j.id;
        version.current = nextVersion;
        setSavedAt(Date.now());
        setSavingError(null);
      } catch (e: unknown) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await enqueue({ kind: "result.upsert", body });
          setSavingError("Saved offline. Will sync when online.");
        } else {
          setSavingError("Save failed — retype to retry.");
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const severityColor =
    flag.severity === FlagSeverity.Critical ? "border-red-500 bg-red-50" :
    flag.severity === FlagSeverity.High ? "border-orange-400 bg-orange-50" :
    flag.severity === FlagSeverity.Low ? "border-orange-400 bg-orange-50" :
    "border-gray-200";

  const isQualitative = (parameter.result_type ?? "Numeric") === "Qualitative";

  return (
    <div className={`border rounded p-3 ${severityColor}`}>
      <div className="flex items-baseline justify-between mb-1">
        <label className="font-medium">{parameter.name}</label>
        <span className="text-xs text-gray-500">
          Normal: {rangeOf(parameter, patient)} {parameter.unit ?? ""}
        </span>
      </div>
      {isQualitative ? (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border rounded px-3 py-2 bg-white"
        >
          <option value="">—</option>
          {parseQualitativeOptions(parameter.qualitative_options).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          className="w-full border rounded px-3 py-2 text-lg"
        />
      )}
      <div className="text-xs mt-1 flex justify-between">
        <span>
          {flag.severity !== FlagSeverity.Normal && (
            <strong className="text-red-700">{flag.severity}</strong>
          )}{" "}
          {parameter.unit ?? ""}
        </span>
        <span className="text-gray-500">{savingError ?? (savedAt ? "Saved" : "")}</span>
      </div>
    </div>
  );
}
