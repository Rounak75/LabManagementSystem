import { describe, it, expect } from "vitest";
import { resolveRefRange } from "../ref-range";

/**
 * The range a result is judged against, resolved once so that the abnormal flag
 * stored on the result and the range printed beside it on the report cannot
 * disagree.
 */

const noRanges = {
  refRangeMaleMin: null, refRangeMaleMax: null,
  refRangeFemaleMin: null, refRangeFemaleMax: null,
  refRangeChildMin: null, refRangeChildMax: null,
};

/** Stands in for Prisma.Decimal: a non-null object wrapping a number. */
const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n });

describe("resolveRefRange", () => {
  it("reads the child range for a patient under the boundary", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeChildMin: 3, refRangeChildMax: 9, refRangeMaleMin: 70, refRangeMaleMax: 110 },
      { age: 8, sex: "Male" },
      12,
    );
    expect(r).toEqual({ min: 3, max: 9 });
  });

  it("reads the sex range for a patient at or over the boundary", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeChildMin: 3, refRangeChildMax: 9, refRangeMaleMin: 70, refRangeMaleMax: 110 },
      { age: 12, sex: "Male" },
      12,
    );
    expect(r).toEqual({ min: 70, max: 110 });
  });

  it("reads the female range for a female patient", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeFemaleMin: 11.5, refRangeFemaleMax: 16, refRangeMaleMin: 13, refRangeMaleMax: 17 },
      { age: 30, sex: "Female" },
      12,
    );
    expect(r).toEqual({ min: 11.5, max: 16 });
  });

  it("treats a sex other than Female as the male range", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeMaleMin: 13, refRangeMaleMax: 17 },
      { age: 30, sex: "Other" },
      12,
    );
    expect(r).toEqual({ min: 13, max: 17 });
  });

  // A parameter carrying only half a paediatric range would otherwise judge the
  // result against a half-open range.
  it("falls back to the sex range when the child range is only half recorded", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeChildMin: 3, refRangeChildMax: null, refRangeMaleMin: 70, refRangeMaleMax: 110 },
      { age: 8, sex: "Male" },
      12,
    );
    expect(r).toEqual({ min: 70, max: 110 });
  });

  it("returns null when the parameter records no usable range", () => {
    expect(resolveRefRange(noRanges, { age: 30, sex: "Male" }, 12)).toBeNull();
  });

  // A truthiness test would read this lower bound as "no bound" and silently
  // fall through to the adult range.
  it("keeps a lower bound of zero", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeChildMin: 0, refRangeChildMax: 5, refRangeMaleMin: 70, refRangeMaleMax: 110 },
      { age: 8, sex: "Male" },
      12,
    );
    expect(r).toEqual({ min: 0, max: 5 });
  });

  it("keeps a lower bound of zero arriving as a Decimal", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeChildMin: dec(0), refRangeChildMax: dec(5) },
      { age: 8, sex: "Male" },
      12,
    );
    expect(r).toEqual({ min: 0, max: 5 });
  });

  it("converts Decimal bounds to numbers", () => {
    const r = resolveRefRange(
      { ...noRanges, refRangeMaleMin: dec(70), refRangeMaleMax: dec(110) },
      { age: 30, sex: "Male" },
      12,
    );
    expect(r).toEqual({ min: 70, max: 110 });
  });
});
