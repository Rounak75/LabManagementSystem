// Which reference range a result is judged against.
//
// This ladder — child range, else the patient's sex range, else nothing — was
// written twice: once in abnormality.ts to decide the abnormal flag stored on
// the result, and once in report.service.ts to decide the range printed beside
// that result on the report. The two agreed today only by coincidence, and the
// printed range is not decoration: the PDF re-parses it to choose the H/L
// marker (pdf/sections/common.ts), so a range resolved one way and a flag
// resolved another produce a report that contradicts itself in the patient's
// hand.
//
// Resolving it once means the flag and the printed range cannot disagree.

/**
 * A bound as Prisma hands it over.
 *
 * The refRange* columns are `Decimal?`, so at runtime these are
 * `Prisma.Decimal` instances — not numbers. Callers that have already converted
 * pass plain numbers, so both are accepted.
 */
export type RefBound = number | { toNumber(): number } | null | undefined;

export interface RefRangeSource {
  refRangeMaleMin: RefBound;
  refRangeMaleMax: RefBound;
  refRangeFemaleMin: RefBound;
  refRangeFemaleMax: RefBound;
  refRangeChildMin: RefBound;
  refRangeChildMax: RefBound;
}

export interface RefRangePatient {
  age: number;
  /** "Male" | "Female" | "Other" — anything other than "Female" reads the male range. */
  sex: string;
}

export interface RefRange {
  min: number;
  max: number;
}

/**
 * Converts a bound to a number, keeping zero.
 *
 * A truthiness test (`bound ? Number(bound) : null`) reads a legitimate lower
 * bound of 0 as "no bound" the moment the value arrives as a plain number
 * rather than a Decimal — a Decimal is an object and therefore always truthy,
 * so the same expression behaves differently depending on whether the caller
 * converted first. Testing against null explicitly removes that difference.
 */
function toNumber(bound: RefBound): number | null {
  if (bound === null || bound === undefined) return null;
  const n = Number(bound);
  return Number.isNaN(n) ? null : n;
}

/**
 * Resolves the range this patient's result should be judged against, or null
 * when the parameter records no usable range.
 *
 * A child whose parameter carries only half a paediatric range falls back to
 * the sex range rather than being judged against a half-open one.
 */
export function resolveRefRange(
  param: RefRangeSource,
  patient: RefRangePatient,
  childAgeBoundary: number,
): RefRange | null {
  if (patient.age < childAgeBoundary) {
    const min = toNumber(param.refRangeChildMin);
    const max = toNumber(param.refRangeChildMax);
    if (min !== null && max !== null) return { min, max };
  }

  const min = toNumber(
    patient.sex === "Female" ? param.refRangeFemaleMin : param.refRangeMaleMin,
  );
  const max = toNumber(
    patient.sex === "Female" ? param.refRangeFemaleMax : param.refRangeMaleMax,
  );
  if (min === null || max === null) return null;
  return { min, max };
}
