// Shared abnormality flagging for the admin portal's result-entry flow.
// The `isAbnormal` boolean mirrors desktop's services/abnormality.ts exactly
// (case-insensitive qualitative compare, child→sex range fallback, empty/NaN →
// not abnormal). `severity` is an additive, cloud-only refinement used to colour
// the result cards and surface critical values; desktop has no severity concept.

export enum FlagSeverity {
  Normal = "Normal",
  Low = "Low",
  High = "High",
  Critical = "Critical",
}

// A value this many range-spans beyond the abnormal threshold is "Critical".
const CRITICAL_FACTOR = 1.5;

const DEFAULT_CHILD_AGE_BOUNDARY = 13;

export interface ParameterRange {
  resultType: "Numeric" | "Qualitative";
  refRangeMaleMin: number | null;
  refRangeMaleMax: number | null;
  refRangeFemaleMin: number | null;
  refRangeFemaleMax: number | null;
  refRangeChildMin: number | null;
  refRangeChildMax: number | null;
  qualitativeOptions?: string | null;
  normalQualitative?: string | null;
}

export interface PatientContext {
  age: number;
  sex: "Male" | "Female" | "Other";
  /** Defaults to 13 to match desktop's typical lab setting. */
  childAgeBoundary?: number;
}

export interface FlagResult {
  isAbnormal: boolean;
  severity: FlagSeverity;
}

const NORMAL: FlagResult = { isAbnormal: false, severity: FlagSeverity.Normal };

export function flagValue(
  value: string,
  param: ParameterRange,
  patient: PatientContext,
): FlagResult {
  if (!value || value.trim() === "") return NORMAL;

  if (param.resultType === "Qualitative") {
    if (!param.normalQualitative) return NORMAL;
    const abnormal =
      value.trim().toLowerCase() !== param.normalQualitative.trim().toLowerCase();
    return { isAbnormal: abnormal, severity: abnormal ? FlagSeverity.High : FlagSeverity.Normal };
  }

  const n = Number(value);
  if (!isFinite(n)) return NORMAL;

  const boundary = patient.childAgeBoundary ?? DEFAULT_CHILD_AGE_BOUNDARY;
  let min: number | null;
  let max: number | null;

  if (patient.age < boundary) {
    min = param.refRangeChildMin;
    max = param.refRangeChildMax;
    // Desktop falls back to the sex-specific range when child ranges are unset.
    if (min == null || max == null) {
      if (patient.sex === "Female") {
        min = param.refRangeFemaleMin;
        max = param.refRangeFemaleMax;
      } else {
        min = param.refRangeMaleMin;
        max = param.refRangeMaleMax;
      }
    }
  } else if (patient.sex === "Female") {
    min = param.refRangeFemaleMin;
    max = param.refRangeFemaleMax;
  } else {
    min = param.refRangeMaleMin;
    max = param.refRangeMaleMax;
  }

  if (min == null || max == null) return NORMAL;

  const span = max - min;
  if (n < min) {
    const distance = min - n;
    return { isAbnormal: true, severity: distance > span * CRITICAL_FACTOR ? FlagSeverity.Critical : FlagSeverity.Low };
  }
  if (n > max) {
    const distance = n - max;
    return { isAbnormal: true, severity: distance > span * CRITICAL_FACTOR ? FlagSeverity.Critical : FlagSeverity.High };
  }
  return NORMAL;
}
