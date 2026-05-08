import { describe, it, expect } from "vitest";
import { validate, type TemplateConfig } from "@shared/template-config";

const GOOD: TemplateConfig = {
  headerText: "Golmuri Janch Ghar",
  footerText: "Thank you for choosing us.",
  signatureLine: "Dr. P. C. Du, MD",
  fontFamily: "Inter",
  fontSize: 11,
  accentColor: "#0f766e",
  sections: { logo: true, doctorInfo: true, parametersTable: true, abnormalLegend: true, disclaimer: true },
  columns: { testName: true, result: true, unit: true, referenceRange: true, flag: true, comments: false },
};

describe("template-config validate", () => {
  it("accepts a complete config", () => {
    const r = validate(GOOD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(GOOD);
  });

  it("rejects null and non-object input", () => {
    expect(validate(null).ok).toBe(false);
    expect(validate("nope" as any).ok).toBe(false);
  });

  it("rejects unknown fontFamily", () => {
    expect(validate({ ...GOOD, fontFamily: "Comic Sans" } as any).ok).toBe(false);
  });

  it("rejects fontSize out of 10..14", () => {
    expect(validate({ ...GOOD, fontSize: 9 }).ok).toBe(false);
    expect(validate({ ...GOOD, fontSize: 15 }).ok).toBe(false);
    expect(validate({ ...GOOD, fontSize: 10 }).ok).toBe(true);
    expect(validate({ ...GOOD, fontSize: 14 }).ok).toBe(true);
  });

  it("rejects bad accentColor", () => {
    expect(validate({ ...GOOD, accentColor: "tealish" }).ok).toBe(false);
    expect(validate({ ...GOOD, accentColor: "#zzz" }).ok).toBe(false);
    expect(validate({ ...GOOD, accentColor: "0f766e" }).ok).toBe(false);   // missing #
    expect(validate({ ...GOOD, accentColor: "#0f766e" }).ok).toBe(true);
  });

  it("rejects missing sections", () => {
    expect(validate({ ...GOOD, sections: undefined } as any).ok).toBe(false);
    expect(validate({ ...GOOD, sections: { ...GOOD.sections, logo: undefined } } as any).ok).toBe(false);
  });

  it("rejects missing columns", () => {
    expect(validate({ ...GOOD, columns: undefined } as any).ok).toBe(false);
  });

  it("rejects missing string fields", () => {
    expect(validate({ ...GOOD, headerText: undefined } as any).ok).toBe(false);
    expect(validate({ ...GOOD, footerText: 5 } as any).ok).toBe(false);
  });
});
