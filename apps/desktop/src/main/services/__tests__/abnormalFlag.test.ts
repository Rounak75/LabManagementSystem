import { describe, it, expect } from "vitest";
import { abnormalFlag } from "@/pdf/sections/common";

/**
 * The marker printed beside an out-of-range result.
 *
 * The only signal distinguishing an abnormal value was red text. The lab prints
 * in black and white, so on the paper a patient is actually handed — and on the
 * photocopy that goes into a file — a dangerously high result looked exactly
 * like a normal one. A letter survives any printer, and tells the reader which
 * direction it went, which the colour never did.
 */
describe("abnormalFlag", () => {
  it("marks a value above the range High", () => {
    expect(abnormalFlag("180", "70 – 110")).toBe("H");
  });

  it("marks a value below the range Low", () => {
    expect(abnormalFlag("45", "70 – 110")).toBe("L");
  });

  it("handles a hyphen as well as an en dash", () => {
    expect(abnormalFlag("180", "70 - 110")).toBe("H");
  });

  it("copes with decimals", () => {
    expect(abnormalFlag("9.2", "11.5 – 16")).toBe("L");
  });

  // A qualitative result — "Positive" against "Normal: Negative" — is abnormal
  // but has no direction. It still needs to be visibly marked.
  it("falls back to a neutral marker when there is no numeric range", () => {
    expect(abnormalFlag("Positive", "Normal: Negative")).toBe("*");
  });

  it("falls back to a neutral marker when the value is not a number", () => {
    expect(abnormalFlag("Trace", "70 – 110")).toBe("*");
  });

  it("falls back to a neutral marker when no range was recorded", () => {
    expect(abnormalFlag("180", "")).toBe("*");
  });

  // Only ever called for results already judged abnormal, so a value sitting
  // inside its printed range still has to be marked rather than silently
  // un-flagged — the abnormality was decided elsewhere, possibly by hand.
  it("still marks a value that sits inside its printed range", () => {
    expect(abnormalFlag("90", "70 – 110")).toBe("*");
  });
});
