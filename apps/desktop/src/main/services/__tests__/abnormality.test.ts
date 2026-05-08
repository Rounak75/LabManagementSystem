import { describe, it, expect } from "vitest";
import { isAbnormal, type AbnormalityInput } from "../abnormality";

const numericMaleCholesterol = (value: string): AbnormalityInput => ({
  resultType: "Numeric",
  value,
  patientSex: "Male",
  patientAge: 40,
  childAgeBoundary: 12,
  refRangeMaleMin: 150, refRangeMaleMax: 250,
  refRangeFemaleMin: 150, refRangeFemaleMax: 250,
  refRangeChildMin: null, refRangeChildMax: null,
  qualitativeOptions: null, normalQualitative: null
});

describe("abnormality", () => {
  it("flags numeric value above range", () => {
    expect(isAbnormal(numericMaleCholesterol("260"))).toBe(true);
  });
  it("flags numeric value below range", () => {
    expect(isAbnormal(numericMaleCholesterol("120"))).toBe(true);
  });
  it("does not flag value within range", () => {
    expect(isAbnormal(numericMaleCholesterol("180"))).toBe(false);
  });
  it("returns false for empty value", () => {
    expect(isAbnormal(numericMaleCholesterol(""))).toBe(false);
  });
  it("uses child range when patient is under boundary", () => {
    const child: AbnormalityInput = {
      resultType: "Numeric", value: "9",
      patientSex: "Male", patientAge: 8, childAgeBoundary: 12,
      refRangeMaleMin: 13, refRangeMaleMax: 17,
      refRangeFemaleMin: 12, refRangeFemaleMax: 16,
      refRangeChildMin: 11, refRangeChildMax: 14,
      qualitativeOptions: null, normalQualitative: null
    };
    expect(isAbnormal(child)).toBe(true);
  });
  it("flags qualitative when value differs from normalQualitative", () => {
    expect(isAbnormal({
      resultType: "Qualitative", value: "Positive",
      patientSex: "Female", patientAge: 30, childAgeBoundary: 12,
      refRangeMaleMin: null, refRangeMaleMax: null,
      refRangeFemaleMin: null, refRangeFemaleMax: null,
      refRangeChildMin: null, refRangeChildMax: null,
      qualitativeOptions: '["Positive","Negative"]',
      normalQualitative: "Negative"
    })).toBe(true);
  });
  it("does not flag qualitative match to normal", () => {
    expect(isAbnormal({
      resultType: "Qualitative", value: "Negative",
      patientSex: "Female", patientAge: 30, childAgeBoundary: 12,
      refRangeMaleMin: null, refRangeMaleMax: null,
      refRangeFemaleMin: null, refRangeFemaleMax: null,
      refRangeChildMin: null, refRangeChildMax: null,
      qualitativeOptions: null, normalQualitative: "Negative"
    })).toBe(false);
  });
});
