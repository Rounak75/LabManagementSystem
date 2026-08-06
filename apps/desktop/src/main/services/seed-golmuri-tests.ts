import type { PrismaClient } from "@prisma/client";

export type SeedResultType = "Numeric" | "Qualitative" | "SensitivityGrid" | "TiterGrid";

export type Param = {
  name: string;
  unit: string;
  resultType: SeedResultType;
  refRangeMaleMin?: number | null;
  refRangeMaleMax?: number | null;
  refRangeFemaleMin?: number | null;
  refRangeFemaleMax?: number | null;
  refRangeChildMin?: number | null;
  refRangeChildMax?: number | null;
  qualitativeOptions?: string | null;
  normalQualitative?: string | null;
  computeRule?: string | null;
};

export type Seed = {
  name: string;
  category: "Blood" | "Urine" | "Stool" | "Other";
  price: number;
  isOutsourced?: boolean;
  parameters: Param[];
};

const num = (
  mMin?: number, mMax?: number,
  fMin: number | undefined = mMin, fMax: number | undefined = mMax,
  cMin?: number, cMax?: number
): Omit<Param, "name" | "unit" | "resultType"> => ({
  refRangeMaleMin: mMin ?? null, refRangeMaleMax: mMax ?? null,
  refRangeFemaleMin: fMin ?? null, refRangeFemaleMax: fMax ?? null,
  refRangeChildMin: cMin ?? null, refRangeChildMax: cMax ?? null
});

// Prices carrying a "market" note were repriced on 2026-08-06 from the
// Jamshedpur survey in docs/research/jamshedpur-lab-test-pricing.md. The basis
// is the midpoint of the aggregator's booking rate and its MRP, never either
// end on its own: the booking rate is national customer-acquisition pricing
// subsidised across a whole book, and the MRP is inflated to make the discount
// look larger. The midpoint is the part an independent lab can actually
// sustain. Every figure behind these traces to a page cited in that document.
//
// Changing a number here does NOT reprice a lab that is already running.
// seedOne() below only creates tests it cannot find by name, and
// catalogue-reconciliation.service.ts never touches price. This file is the
// catalogue a *fresh install* starts from; an existing machine has to be
// repriced through Tests → edit, or by a migration written for the purpose.
const BIOCHEMISTRY_TESTS: Seed[] = [
  // market: aggregator ₹79 / MRP ₹197 → midpoint ₹138, rounded to ₹140
  { name: "Blood Glucose Fasting", category: "Blood", price: 140, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(70, 110) }] },
  // market: aggregator ₹79 / MRP ₹160 → midpoint ₹120
  { name: "PP Glucose", category: "Blood", price: 120, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(0, 140) }] },
  // market: aggregator ₹79 / MRP ₹159 → midpoint ₹119, rounded to ₹120
  { name: "Random Glucose", category: "Blood", price: 120, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(0, 130) }] },
  { name: "Urine Sugar", category: "Urine", price: 50, parameters: [{ name: "Value", unit: "", resultType: "Qualitative",
      qualitativeOptions: JSON.stringify(["Nil","Trace","+","++","+++","++++"]), normalQualitative: "Nil" }] },
  // market: aggregator 119 / MRP 140 - a cut
  { name: "Urea", category: "Blood", price: 130, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(15, 40) }] },
  // market: aggregator 149 / MRP 209
  { name: "Creatinine", category: "Blood", price: 180, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(0.9, 1.5, 0.8, 1.2) }] },
  // market: aggregator 129 / MRP 139
  { name: "Total Bilirubin", category: "Blood", price: 135, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(0.2, 1.0) }] },
  { name: "Direct Bilirubin", category: "Blood", price: 100, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(0.0, 0.2) }] },
  { name: "Indirect Bilirubin", category: "Blood", price: 100, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", computeRule: "totalBilirubin - directBilirubin" }] },
  { name: "Alk-Phosphates", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "K.A. Units/100ml", resultType: "Numeric", ...num(3, 13) }] },
  // market: aggregator 189 / MRP 200
  { name: "SGPT (ALT)", category: "Blood", price: 195, parameters: [{ name: "Value", unit: "Unit/ml", resultType: "Numeric", ...num(5, 35) }] },
  { name: "SGOT (AST)", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "Unit/ml", resultType: "Numeric", ...num(8, 40) }] },
  // market: aggregator 139 / MRP 199
  { name: "Total Protein", category: "Blood", price: 170, parameters: [{ name: "Value", unit: "Gm/dl", resultType: "Numeric", ...num(6, 8) }] },
  // market: aggregator 129 / MRP 130
  { name: "Albumin", category: "Blood", price: 130, parameters: [{ name: "Value", unit: "Gm/dl", resultType: "Numeric", ...num(3.5, 5.3) }] },
  { name: "Globulin", category: "Blood", price: 100, parameters: [{ name: "Value", unit: "Gm/dl", resultType: "Numeric", ...num(1.8, 3.1) }] },
  { name: "A:G Ratio", category: "Blood", price: 50, parameters: [{ name: "Value", unit: "ratio", resultType: "Numeric", ...num(2, 2.1) }] },
  // market: aggregator 139 / MRP 150 - a cut
  { name: "Total Cholesterol", category: "Blood", price: 145, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(150, 250) }] },
  { name: "HDL", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(30, 70) }] },
  { name: "LDL", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(0, 150) }] },
  { name: "VLDL", category: "Blood", price: 100, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(30, 75) }] },
  { name: "Triglyceride", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(0, 160) }] },
  // market: aggregator 319 / MRP 400 - large move
  { name: "LDH", category: "Blood", price: 360, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(70, 240) }] },
  { name: "CPK", category: "Blood", price: 200, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(24, 195) }] },
  { name: "CPK-MB", category: "Blood", price: 300, parameters: [{ name: "Value", unit: "U/L", resultType: "Numeric", ...num(0, 25) }] },
  // market: aggregator 139 / MRP 199
  { name: "Uric Acid", category: "Blood", price: 170, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(2.0, 7.0, 1.5, 6.0) }] },
  // market: aggregator 159 / MRP 219
  { name: "Calcium", category: "Blood", price: 190, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(8.5, 11.0) }] },
  { name: "Sodium", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "Mmol/dl", resultType: "Numeric", ...num(135, 155) }] },
  // market: aggregator 179 / MRP 199
  { name: "Potassium", category: "Blood", price: 190, parameters: [{ name: "Value", unit: "Mmol/dl", resultType: "Numeric", ...num(3.5, 5.5) }] },
  { name: "Chloride", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "Mmol/dl", resultType: "Numeric", ...num(96, 106) }] },
  { name: "Iron Phosphate", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(2.5, 5.2) }] },
  { name: "Bicarbonate", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "Mmol/dl", resultType: "Numeric", ...num(24, 32) }] },
  { name: "Acid Phosphate-Total", category: "Blood", price: 200, parameters: [{ name: "Value", unit: "K.A. Unit", resultType: "Numeric", ...num(1, 4) }] },
  { name: "Prs Fact", category: "Blood", price: 200, parameters: [{ name: "Value", unit: "K.A. Unit", resultType: "Numeric", ...num(0, 8) }] },
  // market: aggregator 399 / MRP 485 - large move
  { name: "Amylase", category: "Blood", price: 440, parameters: [{ name: "Value", unit: "H.R. Units", resultType: "Numeric", ...num(9, 35) }] },
  { name: "Copper", category: "Blood", price: 300, parameters: [{ name: "Value", unit: "Ug/dl", resultType: "Numeric", ...num(75, 155) }] },
  { name: "Lithium", category: "Blood", price: 300, parameters: [{ name: "Value", unit: "mEq/L", resultType: "Numeric" }] },
  { name: "Phosphorus", category: "Blood", price: 150, parameters: [{ name: "Value", unit: "mg/dl", resultType: "Numeric", ...num(2.5, 5.0, 2.5, 5.0, 4.0, 6.5) }] }
];

const HEMATOLOGY_TESTS: Seed[] = [
  // market: aggregator ₹299 / MRP ₹350 → midpoint ₹325. Note this is a price
  // *cut*: CBC was the one test priced above even the aggregator's MRP.
  { name: "CBC / Blood Examination", category: "Blood", price: 325, parameters: [
    { name: "Total RBC Count",   unit: "Million/Cu.mm", resultType: "Numeric", ...num(3.5, 5.5) },
    { name: "Haemoglobin",       unit: "GM%",           resultType: "Numeric", ...num(11.5, 16.0, 11.5, 15.0) },
    { name: "Total WBC Count",   unit: "/Cu.mm",        resultType: "Numeric", ...num(4500, 11000) },
    { name: "Neutrophils",       unit: "%",             resultType: "Numeric", ...num(50, 70) },
    { name: "Lymphocytes",       unit: "%",             resultType: "Numeric", ...num(20, 35) },
    { name: "Monocytes",         unit: "%",             resultType: "Numeric", ...num(1, 8) },
    { name: "Eosinophils",       unit: "%",             resultType: "Numeric", ...num(1, 5) },
    { name: "Basophils",         unit: "%",             resultType: "Numeric", ...num(0.0, 0.01) },
    { name: "Platelets",         unit: "Lakhs/Cu.mm",   resultType: "Numeric", ...num(1.5, 4.5) },
    { name: "Reticulocytes",     unit: "%",             resultType: "Numeric", ...num(0.2, 2.0) },
    { name: "ESR (Westergren)",  unit: "mm/1st hr",     resultType: "Numeric", ...num(3, 15, 5, 30) },
    { name: "ESR (Wintrobe)",    unit: "mm/1st hr",     resultType: "Numeric", ...num(0, 10) },
    { name: "BT (Bleeding Time)", unit: "Min",          resultType: "Numeric", ...num(1.0, 3.0) },
    { name: "CT (Clotting Time)", unit: "Min",          resultType: "Numeric", ...num(1.0, 4.0) },
    { name: "PCV",               unit: "%",             resultType: "Numeric", ...num(40, 54, 36, 47) },
    { name: "MCV",               unit: "fl",            resultType: "Numeric", ...num(76, 96) },
    { name: "MCH",               unit: "pg",            resultType: "Numeric", ...num(27, 32) },
    { name: "MCHC",              unit: "g/dl",          resultType: "Numeric", ...num(30, 36) }
  ]}
];

const qual = (opts: string[], normal?: string): Pick<Param, "resultType" | "qualitativeOptions" | "normalQualitative"> => ({
  resultType: "Qualitative",
  qualitativeOptions: JSON.stringify(opts),
  normalQualitative: normal ?? null
});

const URINE_STOOL_TESTS: Seed[] = [
  // market: the two aggregators disagree sharply here — Apollo CUE ₹179/₹448
  // (midpoint ₹314) against 1mg Urine R/M ₹89/₹180 (midpoint ₹135). ₹225 is the
  // mean of the two midpoints; pricing off Apollo alone would have set ₹300 and
  // been wrong by a third. Still a large move from ₹100, which sat below even
  // the subsidised national booking rate.
  { name: "Urine Routine Examination", category: "Urine", price: 225, parameters: [
    { name: "Quantity",                unit: "ml", resultType: "Numeric" },
    { name: "Colour",                  unit: "",   ...qual(["Pale yellow", "Yellow", "Dark yellow", "Red", "Other"]) },
    { name: "Odour",                   unit: "",   ...qual(["Normal", "Foul", "Fruity", "Other"], "Normal") },
    { name: "Sp. Gravity",             unit: "",   resultType: "Numeric", ...num(1.003, 1.030) },
    { name: "Reaction (pH)",           unit: "",   resultType: "Numeric", ...num(4.6, 8.0) },
    { name: "Sediment",                unit: "",   ...qual(["Nil","Scanty","Moderate","Heavy"], "Nil") },
    { name: "Sugar",                   unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Albumin",                 unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Phosphates",              unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Bile Salt",               unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Bile Pigment",            unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Urobilinogen",            unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Acetone",                 unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Blood",                   unit: "",   ...qual(["Nil","Trace","+","++","+++","++++"], "Nil") },
    { name: "Pus Cells / HPF",         unit: "",   resultType: "Numeric", ...num(0, 5) },
    { name: "RBC / HPF",               unit: "",   resultType: "Numeric", ...num(0, 2) },
    { name: "Epithelial Cells / HPF",  unit: "",   ...qual(["Nil","Few","Many"], "Few") },
    { name: "Casts",                   unit: "",   ...qual(["Nil","Hyaline","Granular","Cellular","Other"], "Nil") },
    { name: "Crystals",                unit: "",   ...qual(["Nil","Oxalate","Phosphate","Urate","Other"], "Nil") },
    { name: "Bacteria",                unit: "",   ...qual(["Nil","Few","Many"], "Nil") },
    { name: "Urine for HCG",           unit: "",   ...qual(["Positive","Negative","Not done"], "Negative") }
  ]},
  { name: "Stool Routine Examination", category: "Stool", price: 100, parameters: [
    { name: "Colour",                  unit: "", ...qual(["Brown","Yellow","Black","Green","Bloody","Other"]) },
    { name: "Consistency",             unit: "", ...qual(["Formed","Semi-formed","Loose","Watery"], "Formed") },
    { name: "Blood (Fresh)",           unit: "", ...qual(["Present","Absent"], "Absent") },
    { name: "Mucus",                   unit: "", ...qual(["Present","Absent"], "Absent") },
    { name: "Reaction",                unit: "", ...qual(["Acidic","Alkaline","Neutral"], "Neutral") },
    { name: "Parasites (Visible)",     unit: "", ...qual(["Present","Absent"], "Absent") },
    { name: "Occult Blood",            unit: "", ...qual(["Positive","Negative"], "Negative") },
    { name: "Protozoa / Cysts",        unit: "", ...qual(["Not seen"], "Not seen") },
    { name: "Helminths / Ova",         unit: "", ...qual(["Not seen"], "Not seen") },
    { name: "Cellular Elements",       unit: "", ...qual(["Nil","Few","Many"], "Nil") },
    { name: "Erythrocytes / HPF",      unit: "", resultType: "Numeric", ...num(0, 5) },
    { name: "Leucocytes / HPF",        unit: "", resultType: "Numeric", ...num(0, 5) },
    { name: "Pus Cells / HPF",         unit: "", resultType: "Numeric", ...num(0, 5) },
    { name: "Macrophages",             unit: "", ...qual(["Present","Absent"], "Absent") },
    { name: "Charcot-Leyden Crystals", unit: "", ...qual(["Present","Absent"], "Absent") },
    { name: "Bacterial Flora",         unit: "", ...qual(["Normal","Increased","Decreased"], "Normal") }
  ]}
];

export async function seedOne(prisma: PrismaClient, seed: Seed): Promise<void> {
  const existing = await prisma.test.findFirst({ where: { name: seed.name } });
  const test = existing ?? await prisma.test.create({
    data: {
      name: seed.name,
      category: seed.category,
      price: seed.price,
      isOutsourced: !!seed.isOutsourced
    }
  });
  for (let i = 0; i < seed.parameters.length; i++) {
    const p = seed.parameters[i];
    if (!p) continue;
    const exists = await prisma.testParameter.findFirst({ where: { testId: test.id, name: p.name } });
    if (exists) continue;
    await prisma.testParameter.create({
      data: {
        testId: test.id,
        name: p.name, unit: p.unit, resultType: p.resultType,
        displayOrder: i,
        refRangeMaleMin: p.refRangeMaleMin ?? null,
        refRangeMaleMax: p.refRangeMaleMax ?? null,
        refRangeFemaleMin: p.refRangeFemaleMin ?? null,
        refRangeFemaleMax: p.refRangeFemaleMax ?? null,
        refRangeChildMin: p.refRangeChildMin ?? null,
        refRangeChildMax: p.refRangeChildMax ?? null,
        qualitativeOptions: p.qualitativeOptions ?? null,
        normalQualitative: p.normalQualitative ?? null,
        computeRule: p.computeRule ?? null
      }
    });
  }
}

/** Number of tests this module seeds — used by the boot guard to skip when already seeded. */
export const GOLMURI_SEED_COUNT = BIOCHEMISTRY_TESTS.length + HEMATOLOGY_TESTS.length + URINE_STOOL_TESTS.length;

export async function seedGolmuriTests(prisma: PrismaClient): Promise<void> {
  for (const seed of [...BIOCHEMISTRY_TESTS, ...HEMATOLOGY_TESTS, ...URINE_STOOL_TESTS]) {
    await seedOne(prisma, seed);
  }
}
