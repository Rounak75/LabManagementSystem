import { describe, it, expect } from "vitest";
import { flagValue, FlagSeverity } from "@lab/types";

const hemoglobin = {
  resultType: "Numeric" as const,
  refRangeMaleMin: 13.5,
  refRangeMaleMax: 17.5,
  refRangeFemaleMin: 12.0,
  refRangeFemaleMax: 15.5,
  refRangeChildMin: 11.0,
  refRangeChildMax: 14.0,
};

describe("flagValue (numeric)", () => {
  it("normal: 14 g/dL for adult male", () => {
    expect(flagValue("14", hemoglobin, { age: 30, sex: "Male" }).severity).toBe(FlagSeverity.Normal);
  });
  it("low: 10 g/dL for adult male", () => {
    expect(flagValue("10", hemoglobin, { age: 30, sex: "Male" }).severity).toBe(FlagSeverity.Low);
  });
  it("high: 19 g/dL for adult male", () => {
    expect(flagValue("19", hemoglobin, { age: 30, sex: "Male" }).severity).toBe(FlagSeverity.High);
  });
  it("critical low: 5 g/dL for adult male", () => {
    expect(flagValue("5", hemoglobin, { age: 30, sex: "Male" }).severity).toBe(FlagSeverity.Critical);
  });
  it("uses child range when age < boundary (12 is normal for a child, low for an adult male)", () => {
    expect(flagValue("12", hemoglobin, { age: 6, sex: "Male" }).severity).toBe(FlagSeverity.Normal);
    expect(flagValue("12", hemoglobin, { age: 30, sex: "Male" }).severity).toBe(FlagSeverity.Low);
  });
  it("returns Normal when value not parseable", () => {
    expect(flagValue("not-a-number", hemoglobin, { age: 30, sex: "Male" }).severity).toBe(FlagSeverity.Normal);
  });
  it("uses female range for adult female", () => {
    // 12.5 is within female 12–15.5 but below male 13.5
    expect(flagValue("12.5", hemoglobin, { age: 30, sex: "Female" }).isAbnormal).toBe(false);
    expect(flagValue("12.5", hemoglobin, { age: 30, sex: "Male" }).isAbnormal).toBe(true);
  });
});

describe("flagValue (boolean parity with desktop)", () => {
  it("empty value is never abnormal", () => {
    expect(flagValue("", hemoglobin, { age: 30, sex: "Male" }).isAbnormal).toBe(false);
    expect(flagValue("   ", hemoglobin, { age: 30, sex: "Male" }).isAbnormal).toBe(false);
  });
  it("falls back to sex range when child range is null", () => {
    const noChildRange = { ...hemoglobin, refRangeChildMin: null, refRangeChildMax: null };
    // age 6, male → falls back to male 13.5–17.5; 14 is normal, 10 is abnormal
    expect(flagValue("14", noChildRange, { age: 6, sex: "Male" }).isAbnormal).toBe(false);
    expect(flagValue("10", noChildRange, { age: 6, sex: "Male" }).isAbnormal).toBe(true);
  });
  it("returns Normal when the applicable range is unset", () => {
    const noMale = { ...hemoglobin, refRangeMaleMin: null, refRangeMaleMax: null };
    expect(flagValue("999", noMale, { age: 30, sex: "Male" }).isAbnormal).toBe(false);
  });
});

const bloodGroup = {
  resultType: "Qualitative" as const,
  refRangeMaleMin: null,
  refRangeMaleMax: null,
  refRangeFemaleMin: null,
  refRangeFemaleMax: null,
  refRangeChildMin: null,
  refRangeChildMax: null,
  normalQualitative: "Negative",
};

describe("flagValue (qualitative)", () => {
  it("matches normal qualitative case-insensitively", () => {
    expect(flagValue("negative", bloodGroup, { age: 30, sex: "Male" }).isAbnormal).toBe(false);
    expect(flagValue("Negative", bloodGroup, { age: 30, sex: "Male" }).isAbnormal).toBe(false);
  });
  it("flags a non-normal qualitative value as High", () => {
    const f = flagValue("Positive", bloodGroup, { age: 30, sex: "Male" });
    expect(f.isAbnormal).toBe(true);
    expect(f.severity).toBe(FlagSeverity.High);
  });
  it("returns Normal when no normalQualitative is defined", () => {
    const undefinedNormal = { ...bloodGroup, normalQualitative: null };
    expect(flagValue("anything", undefinedNormal, { age: 30, sex: "Male" }).isAbnormal).toBe(false);
  });
});
