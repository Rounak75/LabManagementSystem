export type TemplateConfig = {
  headerText: string;
  footerText: string;
  signatureLine: string;
  fontFamily: "Inter" | "Times" | "Georgia";
  fontSize: number;
  accentColor: string;
  sections: {
    logo: boolean;
    doctorInfo: boolean;
    parametersTable: boolean;
    abnormalLegend: boolean;
    disclaimer: boolean;
  };
  columns: {
    testName: boolean;
    result: boolean;
    unit: boolean;
    referenceRange: boolean;
    flag: boolean;
    comments: boolean;
  };
};

const FONTS = ["Inter", "Times", "Georgia"] as const;
const SECTION_KEYS = ["logo", "doctorInfo", "parametersTable", "abnormalLegend", "disclaimer"] as const;
const COLUMN_KEYS = ["testName", "result", "unit", "referenceRange", "flag", "comments"] as const;

export type ValidateResult =
  | { ok: true; value: TemplateConfig }
  | { ok: false; error: string };

export function validate(input: unknown): ValidateResult {
  if (!input || typeof input !== "object") return { ok: false, error: "not an object" };
  const c = input as Record<string, any>;
  if (typeof c.headerText !== "string") return { ok: false, error: "headerText" };
  if (typeof c.footerText !== "string") return { ok: false, error: "footerText" };
  if (typeof c.signatureLine !== "string") return { ok: false, error: "signatureLine" };
  if (!FONTS.includes(c.fontFamily)) return { ok: false, error: "fontFamily" };
  if (typeof c.fontSize !== "number" || c.fontSize < 10 || c.fontSize > 14) return { ok: false, error: "fontSize" };
  if (typeof c.accentColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c.accentColor)) return { ok: false, error: "accentColor" };
  if (!c.sections || typeof c.sections !== "object") return { ok: false, error: "sections" };
  for (const k of SECTION_KEYS) {
    if (typeof c.sections[k] !== "boolean") return { ok: false, error: `sections.${k}` };
  }
  if (!c.columns || typeof c.columns !== "object") return { ok: false, error: "columns" };
  for (const k of COLUMN_KEYS) {
    if (typeof c.columns[k] !== "boolean") return { ok: false, error: `columns.${k}` };
  }
  return { ok: true, value: c as TemplateConfig };
}
