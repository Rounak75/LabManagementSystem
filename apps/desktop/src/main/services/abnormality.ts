import type { ResultType, Sex } from "@lab/types";

export interface AbnormalityInput {
  resultType: ResultType;
  value: string;
  patientSex: Sex;
  patientAge: number;
  childAgeBoundary: number;
  refRangeMaleMin: number | null;   refRangeMaleMax: number | null;
  refRangeFemaleMin: number | null; refRangeFemaleMax: number | null;
  refRangeChildMin: number | null;  refRangeChildMax: number | null;
  qualitativeOptions: string | null;
  normalQualitative: string | null;
}

export function isAbnormal(input: AbnormalityInput): boolean {
  if (!input.value || input.value.trim() === "") return false;

  if (input.resultType === "Qualitative") {
    if (!input.normalQualitative) return false;
    return input.value.trim().toLowerCase() !== input.normalQualitative.trim().toLowerCase();
  }

  const numeric = Number(input.value);
  if (Number.isNaN(numeric)) return false;

  const isChild = input.patientAge < input.childAgeBoundary;
  let min: number | null;
  let max: number | null;
  if (isChild) {
    min = input.refRangeChildMin; max = input.refRangeChildMax;
    if (min === null || max === null) {
      if (input.patientSex === "Female") { min = input.refRangeFemaleMin; max = input.refRangeFemaleMax; }
      else                               { min = input.refRangeMaleMin;   max = input.refRangeMaleMax; }
    }
  } else if (input.patientSex === "Female") {
    min = input.refRangeFemaleMin; max = input.refRangeFemaleMax;
  } else {
    min = input.refRangeMaleMin;   max = input.refRangeMaleMax;
  }
  if (min === null || max === null) return false;
  return numeric < min || numeric > max;
}
