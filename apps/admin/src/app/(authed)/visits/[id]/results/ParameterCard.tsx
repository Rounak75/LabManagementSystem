"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  // Whether the failure that produced `savingError` is worth trying again.
  // A locked row or a stale version is not — those need a human decision.
  const [canRetry, setCanRetry] = useState(false);
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

  // Extracted from the debounce effect so the Retry control can re-run exactly
  // the same write. Recovery used to depend on `value` changing, which meant the
  // only way back from a failed save was to retype the number — the double entry
  // this whole product exists to remove, at the one moment a patient is waiting.
  const save = useCallback(async () => {
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

    // A base_version captured now would almost certainly be stale by the time
    // the queue drains, so the replay is deliberately unconditional. The server
    // still assigns the version — the client never dictates it.
    const queueOffline = async () => {
      const { base_version: _unused, ...offlineBody } = body;
      await enqueue({ kind: "result.upsert", body: offlineBody });
      setSavedAt(Date.now());
      setSavingError("Saved on this phone. Will sync when the connection returns.");
      setCanRetry(false);
    };

    let r: Response;
    try {
      r = await fetch("/api/results/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // The request never reached the server. `navigator.onLine` is not consulted
      // here on purpose: it reports true on lab wi-fi that has associated but has
      // no route out, which is the common failure at the counter, not the edge.
      await queueOffline();
      return;
    }

    if (r.status === 409) {
      const j = (await r.json().catch(() => ({}))) as { code?: string };
      setSavingError(
        j.code === "result_locked"
          ? "This test is verified and locked — ask an Admin to unlock it."
          : "Someone else changed this value. Reload the page to see it.",
      );
      // Neither case is retryable by repeating the same write.
      setCanRetry(false);
      return;
    }

    if (r.status >= 500) {
      // The server is reachable but broken. Holding the value locally is always
      // better than asking someone to remember and retype it.
      await queueOffline();
      return;
    }

    if (!r.ok) {
      setSavingError("Not saved. Tap Retry.");
      setCanRetry(true);
      return;
    }

    const j = (await r.json()) as { id: string; version: number };
    resultId.current = j.id;
    version.current = j.version;
    setSavedAt(Date.now());
    setSavingError(null);
    setCanRetry(false);
  }, [value, flag.isAbnormal, visitTestId, parameter.id]);

  useEffect(() => {
    if (value === initialValue && resultId.current === initialResultId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, DEBOUNCE_MS);
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
  const fieldId = `param-${parameter.id}`;
  const rangeId = `param-${parameter.id}-range`;

  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${severityColor}`}>
      {/* The label was inert — no htmlFor, not wrapping the field — so the
          accessible name fell to aria-label and the reference range beside it
          was never announced. A screen-reader user got the parameter name and
          nothing else: no range, no unit. Both are now bound to the field. */}
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={fieldId} className="font-semibold text-slate-900">
          {parameter.name}
        </label>
        <span id={rangeId} className="shrink-0 text-xs text-slate-600">
          Normal: {rangeOf(parameter, patient)} {parameter.unit ?? ""}
        </span>
      </div>
      {isQualitative ? (
        <select
          id={fieldId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={rangeId}
          className="input"
        >
          <option value="">—</option>
          {parseQualitativeOptions(parameter.qualitative_options).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          id={fieldId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          aria-describedby={rangeId}
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
            <span className="text-slate-600">{parameter.unit ?? ""}</span>
          )}
        </span>
        {/* Whether a medical value actually persisted is the single most
            important status on this screen, and it was announced to nobody. */}
        <span
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 ${savingError ? "text-amber-800" : "text-emerald-700"}`}
        >
          {savingError ?? (savedAt ? "✓ Saved" : "")}
          {canRetry && (
            <button
              type="button"
              onClick={() => {
                setSavingError(null);
                setCanRetry(false);
                void save();
              }}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-50"
            >
              Retry
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
