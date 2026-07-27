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
      // `base_version` is the version this edit was based on. The server assigns
      // the stored version and rejects the write if the row moved on meanwhile,
      // so two people editing the same value can no longer overwrite each other.
      const body = {
        id: resultId.current,
        visit_test_id: visitTestId,
        parameter_id: parameter.id,
        value,
        is_abnormal: flag.isAbnormal,
        base_version: version.current,
      };
      try {
        const r = await fetch("/api/results/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.status === 409) {
          const j = (await r.json()) as { code?: string; error?: string };
          setSavingError(
            j.code === "result_locked"
              ? "This test is verified and locked — ask an Admin to unlock it."
              : "Someone else changed this value. Reload the page to see it.",
          );
          return;
        }
        if (!r.ok) throw new Error(await r.text());
        const j = (await r.json()) as { id: string; version: number };
        resultId.current = j.id;
        version.current = j.version;
        setSavedAt(Date.now());
        setSavingError(null);
      } catch (e: unknown) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          // A base_version captured now would almost certainly be stale by the
          // time the queue drains, so the replay is deliberately unconditional.
          // The server still assigns the version — the client never dictates it.
          const { base_version: _unused, ...offlineBody } = body;
          await enqueue({ kind: "result.upsert", body: offlineBody });
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
    flag.severity === FlagSeverity.Critical ? "border-rose-300 bg-rose-50 ring-1 ring-rose-200" :
    flag.severity === FlagSeverity.High ? "border-amber-300 bg-amber-50" :
    flag.severity === FlagSeverity.Low ? "border-amber-300 bg-amber-50" :
    "border-slate-200 bg-white";

  const isQualitative = (parameter.result_type ?? "Numeric") === "Qualitative";
  const abnormal = flag.severity !== FlagSeverity.Normal;

  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${severityColor}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="font-semibold text-slate-900">{parameter.name}</label>
        <span className="shrink-0 text-xs text-slate-500">
          Normal: {rangeOf(parameter, patient)} {parameter.unit ?? ""}
        </span>
      </div>
      {isQualitative ? (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={parameter.name}
          className="input"
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
          aria-label={parameter.name}
          className={`input text-lg font-semibold ${abnormal ? "border-rose-300" : ""}`}
        />
      )}
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="font-medium">
          {abnormal ? (
            <span className={flag.severity === FlagSeverity.Critical ? "text-rose-700" : "text-amber-700"}>
              {flag.severity} {parameter.unit ?? ""}
            </span>
          ) : (
            <span className="text-slate-400">{parameter.unit ?? ""}</span>
          )}
        </span>
        <span className={savingError ? "text-amber-700" : "text-emerald-600"}>
          {savingError ?? (savedAt ? "✓ Saved" : "")}
        </span>
      </div>
    </div>
  );
}
