import type { ResultType, Sex } from "@lab/types";
import { resolveRefRange, type RefBound } from "./ref-range";

export interface AbnormalityInput {
  resultType: ResultType;
  value: string;
  patientSex: Sex;
  patientAge: number;
  childAgeBoundary: number;
  // RefBound rather than `number | null` so a caller can hand over a Prisma row
  // directly. The columns are Decimal, and every caller was converting them by
  // hand — with two different spellings, one of which would have read a bound of
  // 0 as absent had the value ever arrived already converted. resolveRefRange
  // does the conversion in one place instead.
  refRangeMaleMin: RefBound;   refRangeMaleMax: RefBound;
  refRangeFemaleMin: RefBound; refRangeFemaleMax: RefBound;
  refRangeChildMin: RefBound;  refRangeChildMax: RefBound;
  qualitativeOptions: string | null;
  normalQualitative: string | null;
}

export function isAbnormal(input: AbnormalityInput, override?: boolean | null): boolean {
  if (override !== undefined && override !== null) return override;
  if (!input.value || input.value.trim() === "") return false;

  if (input.resultType === "Qualitative") {
    if (!input.normalQualitative) return false;
    return input.value.trim().toLowerCase() !== input.normalQualitative.trim().toLowerCase();
  }

  const numeric = Number(input.value);
  if (Number.isNaN(numeric)) return false;

  const range = resolveRefRange(
    input,
    { age: input.patientAge, sex: input.patientSex },
    input.childAgeBoundary,
  );
  if (!range) return false;
  return numeric < range.min || numeric > range.max;
}
