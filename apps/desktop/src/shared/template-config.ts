export type LetterheadFootprint = {
  skipHeader: boolean;
  skipFooter: boolean;
  skipColumnHeaders: boolean;
  skipSignatureLabels: boolean;
};

export type TemplateConfig = {
  headerText: string;
  footerText: string;
  signatureLine: string;
  fontFamily: "Inter" | "Times" | "Georgia";
  fontSize: number;
  accentColor: string;
  layout?: "default" | "golmuri-standard";
  // Phase 3d Plan A — print-time layout mode picked by default. "FullPage" renders
  // header/footer bands and column headers; "ContentOnly" omits them so the page
  // can be printed onto the lab's pre-printed colored letterhead.
  defaultLayout?: "FullPage" | "ContentOnly";
  letterheadFootprint?: LetterheadFootprint;
  // How much blank space ContentOnly leaves for the paper's own printing,
  // measured from the page edge in millimetres so the owner can set it with a
  // ruler against a real sheet. Skipping the drawn header is not enough on its
  // own: without a reserve the results slide up underneath the pre-printed
  // masthead.
  letterheadReserveMm?: number;
  letterheadFooterReserveMm?: number;
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
  if (c.layout !== undefined && c.layout !== "default" && c.layout !== "golmuri-standard") {
    return { ok: false, error: "layout" };
  }
  if (c.defaultLayout !== undefined && c.defaultLayout !== "FullPage" && c.defaultLayout !== "ContentOnly") {
    return { ok: false, error: "defaultLayout" };
  }
  if (c.letterheadFootprint !== undefined) {
    if (!c.letterheadFootprint || typeof c.letterheadFootprint !== "object") {
      return { ok: false, error: "letterheadFootprint" };
    }
    for (const k of ["skipHeader", "skipFooter", "skipColumnHeaders", "skipSignatureLabels"] as const) {
      if (typeof c.letterheadFootprint[k] !== "boolean") return { ok: false, error: `letterheadFootprint.${k}` };
    }
  }
  for (const k of ["letterheadReserveMm", "letterheadFooterReserveMm"] as const) {
    if (c[k] === undefined) continue;
    // Bounded so a stray keypress cannot push every result off an A4 sheet.
    if (typeof c[k] !== "number" || !Number.isFinite(c[k]) || c[k] < 0 || c[k] > MAX_RESERVE_MM) {
      return { ok: false, error: k };
    }
  }
  return { ok: true, value: c as TemplateConfig };
}

/** A4 is 297mm tall; half the page is already an absurd masthead. */
export const MAX_RESERVE_MM = 120;
export const DEFAULT_HEADER_RESERVE_MM = 45;

export const MM_TO_PT = 72 / 25.4;
export const mmToPt = (mm: number): number => mm * MM_TO_PT;

export type ResolvedLetterhead = {
  contentOnly: boolean;
  skipHeader: boolean;
  skipFooter: boolean;
  skipColumnHeaders: boolean;
  skipSignatureLabels: boolean;
  headerReserveMm: number;
  footerReserveMm: number;
};

/**
 * One place that decides what "printing onto pre-printed paper" means, shared
 * by both templates so the two cannot drift apart.
 *
 * ContentOnly drops the bands the paper already carries. Header and footer
 * default to skipped because those are the letterhead itself; column headers
 * and signature labels default to *kept*, because they describe the results
 * rather than the lab, and a report that loses "Normal Range" is harder to
 * read rather than better aligned. `letterheadFootprint` overrides any of it.
 */
export function resolveLetterhead(config: TemplateConfig): ResolvedLetterhead {
  const contentOnly = config.defaultLayout === "ContentOnly";
  const fp = config.letterheadFootprint;
  const on = (v: boolean | undefined, fallback: boolean) =>
    contentOnly && (v ?? fallback);
  return {
    contentOnly,
    skipHeader: on(fp?.skipHeader, true),
    skipFooter: on(fp?.skipFooter, true),
    skipColumnHeaders: on(fp?.skipColumnHeaders, false),
    skipSignatureLabels: on(fp?.skipSignatureLabels, false),
    headerReserveMm: contentOnly
      ? config.letterheadReserveMm ?? DEFAULT_HEADER_RESERVE_MM
      : 0,
    footerReserveMm: contentOnly ? config.letterheadFooterReserveMm ?? 0 : 0,
  };
}
