import type { PrismaClient } from "@prisma/client";
import { seedOne, type Param, type Seed } from "@main/services/seed-golmuri-tests";

/**
 * Panel tests — the bundles a patient actually orders ("Lipid Profile") rather
 * than the individual analytes ("HDL").
 *
 * These existed in packages/db/src/seed.ts as names with zero parameters, which
 * meant result entry rendered no input at all: the desktop table had no rows and
 * the admin app showed "No parameters defined for this test." Twelve of the
 * seventy-two active tests were unusable for that reason.
 *
 * REFERENCE RANGES — every range here is one of:
 *   (a) copied verbatim from the same analyte's standalone test in
 *       seed-golmuri-tests.ts, so an analyte prints the same range whether it is
 *       ordered alone or inside a panel, or
 *   (b) new, and marked `// SOURCE:` with where it came from.
 *
 * Ranges are analyzer- and kit-dependent. Before this catalogue prints on a
 * patient report the lab's pathologist must reconcile every value below against
 * the reagent kit inserts actually in use. See
 * docs/research/test-catalogue-review.md for the sign-off table.
 */

const num = (
  mMin?: number, mMax?: number,
  fMin: number | undefined = mMin, fMax: number | undefined = mMax,
  cMin?: number, cMax?: number
): Omit<Param, "name" | "unit" | "resultType"> => ({
  refRangeMaleMin: mMin ?? null, refRangeMaleMax: mMax ?? null,
  refRangeFemaleMin: fMin ?? null, refRangeFemaleMax: fMax ?? null,
  refRangeChildMin: cMin ?? null, refRangeChildMax: cMax ?? null
});

export const PANEL_TESTS: Seed[] = [
  // ─── Lipid Profile ────────────────────────────────────────────────────────
  // Ranges (a) reused from Total Cholesterol / Triglyceride / HDL / LDL / VLDL.
  // market: aggregator ₹359 / MRP ₹400 → midpoint ₹380. A cut of ₹220. Lipid
  // Profile carried the widest gap in the catalogue — ₹600 was 50% above the
  // aggregator's own MRP, on a panel patients shop around for.
  { name: "Lipid Profile", category: "Blood", price: 380, parameters: [
    { name: "Total Cholesterol", unit: "mg/dl", resultType: "Numeric", ...num(150, 250) },
    { name: "Triglycerides",     unit: "mg/dl", resultType: "Numeric", ...num(0, 160) },
    { name: "HDL Cholesterol",   unit: "mg/dl", resultType: "Numeric", ...num(30, 70) },
    { name: "LDL Cholesterol",   unit: "mg/dl", resultType: "Numeric", ...num(0, 150) },
    { name: "VLDL Cholesterol",  unit: "mg/dl", resultType: "Numeric", ...num(30, 75) },
    // computeRule is currently stored but never evaluated anywhere in the app
    // (same as Indirect Bilirubin in seed-golmuri-tests.ts). It records intent;
    // until something reads it, staff type this value in like any other field.
    { name: "CHOL / HDL Ratio",  unit: "ratio", resultType: "Numeric",
      computeRule: "totalCholesterol / hdlCholesterol" }
  ]},

  // ─── Liver Function Test ──────────────────────────────────────────────────
  // Ranges (a) reused from the standalone bilirubin / enzyme / protein tests.
  // market: aggregator ₹399 / MRP ₹710 → midpoint ₹555, rounded to ₹550.
  { name: "Liver Function Test (LFT)", category: "Blood", price: 550, parameters: [
    { name: "Total Bilirubin",    unit: "mg/dl",            resultType: "Numeric", ...num(0.2, 1.0) },
    { name: "Direct Bilirubin",   unit: "mg/dl",            resultType: "Numeric", ...num(0.0, 0.2) },
    { name: "Indirect Bilirubin", unit: "mg/dl",            resultType: "Numeric",
      computeRule: "totalBilirubin - directBilirubin" },
    { name: "SGPT (ALT)",         unit: "Unit/ml",          resultType: "Numeric", ...num(5, 35) },
    { name: "SGOT (AST)",         unit: "Unit/ml",          resultType: "Numeric", ...num(8, 40) },
    { name: "Alkaline Phosphatase", unit: "K.A. Units/100ml", resultType: "Numeric", ...num(3, 13) },
    { name: "Total Protein",      unit: "Gm/dl",            resultType: "Numeric", ...num(6, 8) },
    { name: "Albumin",            unit: "Gm/dl",            resultType: "Numeric", ...num(3.5, 5.3) },
    { name: "Globulin",           unit: "Gm/dl",            resultType: "Numeric", ...num(1.8, 3.1) },
    { name: "A:G Ratio",          unit: "ratio",            resultType: "Numeric",
      computeRule: "albumin / globulin" }
  ]},

  // ─── Kidney Function Test ─────────────────────────────────────────────────
  // Ranges (a) reused from Urea / Creatinine / Uric Acid / electrolytes.
  // market: DERIVED, not read off a page — no standalone KFT listing exists for
  // Jamshedpur. The combined LFT+KFT is ₹649 / MRP ₹1,547 (midpoint ₹1,098);
  // subtracting the LFT midpoint of ₹555 leaves ₹543, rounded to ₹550. This is
  // the one price here resting on arithmetic rather than a cited listing —
  // confirm it before it bills a patient.
  { name: "Kidney Function Test (KFT)", category: "Blood", price: 550, parameters: [
    { name: "Blood Urea",  unit: "mg/dl",   resultType: "Numeric", ...num(15, 40) },
    // SOURCE (b): Medscape Lab Values, Normal Adult — BUN male 8-24, female 6-21 mg/dL.
    { name: "BUN",         unit: "mg/dl",   resultType: "Numeric", ...num(8, 24, 6, 21) },
    { name: "Creatinine",  unit: "mg/dl",   resultType: "Numeric", ...num(0.9, 1.5, 0.8, 1.2) },
    { name: "Uric Acid",   unit: "mg/dl",   resultType: "Numeric", ...num(2.0, 7.0, 1.5, 6.0) },
    { name: "Calcium",     unit: "mg/dl",   resultType: "Numeric", ...num(8.5, 11.0) },
    { name: "Phosphorus",  unit: "mg/dl",   resultType: "Numeric", ...num(2.5, 5.0, 2.5, 5.0, 4.0, 6.5) },
    { name: "Sodium",      unit: "Mmol/dl", resultType: "Numeric", ...num(135, 155) },
    { name: "Potassium",   unit: "Mmol/dl", resultType: "Numeric", ...num(3.5, 5.5) },
    { name: "Chloride",    unit: "Mmol/dl", resultType: "Numeric", ...num(96, 106) }
  ]},

  // ─── Thyroid Profile ──────────────────────────────────────────────────────
  // No T3/T4/TSH existed anywhere in the catalogue, so all three ranges are new.
  // SOURCE (b): NCBI Bookshelf NBK600943 Table 3-10, "Typical Reference Ranges
  // for Serum Thyroid Hormones and TSH in Humans" — T3 75-175 ng/dL,
  // T4 4-11 ug/dL, TSH 0.3-4.0 mU/L. Kit-dependent; needs pathologist sign-off.
  // market: aggregator ₹299 / MRP ₹550 → midpoint ₹425. Outsourced, so the
  // partner lab's rate sets the floor here in a way it does not elsewhere —
  // check this one against what the panel actually costs to send out.
  { name: "Thyroid Profile (T3/T4/TSH)", category: "Blood", price: 425, isOutsourced: true, parameters: [
    { name: "T3 (Triiodothyronine)", unit: "ng/dl",  resultType: "Numeric", ...num(75, 175) },
    { name: "T4 (Thyroxine)",        unit: "ug/dl",  resultType: "Numeric", ...num(4, 11) },
    { name: "TSH",                   unit: "uIU/ml", resultType: "Numeric", ...num(0.3, 4.0) }
  ]},

  // ─── ESR, standalone ──────────────────────────────────────────────────────
  // ESR is sold on its own, not only inside CBC. Range (a) reused from the
  // "ESR (Westergren)" parameter of CBC / Blood Examination.
  // market: aggregator 109 / MRP 149
  { name: "ESR", category: "Blood", price: 130, parameters: [
    { name: "ESR (Westergren)", unit: "mm/1st hr", resultType: "Numeric", ...num(3, 15, 5, 30) }
  ]}
];

/** Number of tests this module seeds — used by the boot guard to skip when already seeded. */
export const PANEL_SEED_COUNT = PANEL_TESTS.length;

export async function seedPanelTests(prisma: PrismaClient): Promise<void> {
  for (const seed of PANEL_TESTS) {
    await seedOne(prisma, seed);
  }
}
