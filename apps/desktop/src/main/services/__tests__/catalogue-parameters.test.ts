import { describe, it, expect } from "vitest";
import { CATALOGUE_PARAMETERS } from "../catalogue-parameters";
import { normaliseTestName } from "../apply-catalogue-parameters";

/**
 * The catalogue map, checked against the names the lab's own database reported
 * as un-enterable.
 *
 * This list is verbatim from the reconciliation log on the lab PC — the 144
 * active tests that had no parameters, and so rendered no inputs for a
 * technician trying to type a result. Keeping it here means a name that drifts,
 * or a map entry with a typo in it, fails a test rather than being found by
 * someone with a patient in front of them.
 */
const STRANDED_ON_THE_LAB_PC = [
  "CK MB", "LDH", "Mountox (10 TU)", "Urine Drug Tests", "RDW", "BUN",
  "FT3", "FT4", "Highly Sensitive TSH", "Absolute Eosinophil",
  "M.C.V(Hct/R.B.C.)", "M.C.H(Hb/R.B.C.)", "M.C.H.C.(Hb/P.C.V.)", "T.P.H.A.Test",
  "Diff.WBC Count", "Widal Test", "Prothrombin Time Test", "Sugar Profile",
  "Aspirated Fluid Examination(CSF,Ascitic,Pleural)", "Cell Type",
  "Serum Electrolyte", "Fungal Smear", "Throat Swab for KLB Culture", "AFB Smear",
  "Fungal Culture", "High Veginal Swab Test", "Urethral Smear Test",
  "Ulcer Smear Test", "24hrs urinary protein", "HCG (Direct Latex Test)",
  "Paps Smear Test", "Microfilaria", "Urine HCG in dilution", "Sugar (F)",
  "Sugar (PP)", "Blood Sugar (F)", "Blood Sugar (PP)", "Glucose Tolerance Test",
  "Blood Sugar (Random)", "Card Test  [ MP]", "Gamma G.T.", "Sputum for AFB",
  "Haemoglobin", "Total WBC Count", "Total RBC Count", "Total Platelet Count",
  "PCV (Haematocrit)", "Mean Cell Volume(MCV)", "Mean Cell Haemoglobin(MCH)",
  "Mean Cell Haemoglobin Concentration(MCHC)", "OPTIMAL RAPID MALARIA TEST",
  "Hbs Ag", "HIV I & II", "HIV I  & II", "T3 T4 TSH", "Blood Sugar (PG)",
  "Urine culture", "A.S.O.Test", "C.Reactive Proteins Test",
  "Chikungunya Test (Elisa Test)", "Activated Partial Thrombo Plastin",
  "Dengucheck  Test", "CPK MB", "Acetone", "Bile pigmant", "Bile salts", "Blood",
  "Urobilinogen", "Porphobilinogen", "Chyle", "H.C.G.(Elisa test)",
  "Reducing Sugar", "Occult Blood", "E.S.R.(Westergren )", "E.S.R.(Wintrobe)",
  "Total WBC count", "Total RBC count", "Total Platelets count",
  "Reticulocytes count", "Bleeding time", "Clotting time", "Malarial Parasite",
  "V.D.R.L. Test", "Kahn Test", "Blood group", "Sickling Test", "Aldehyde Test",
  "Indirect Coombs' Test", "R.A.Test", "T3", "T4", "TSH",
  "Throat swab for KLB smear", "Skin slit smear for AFB", "Nasal smear for AFB",
  "Gram staining for Gonococci", "Blood Glucose(F)", "Blood Glucose(PP)",
  "Blood Glucose Random", "S.Urea", "S.Creatinine", "Total Cholesterol",
  "H.D.L.Cholesterol", "L.D.L.Cholesterol", "S.Triglyceride",
  "S.Bilirubin Total", "S.Bilirubin Indirect", "S.Bilirubin  Direct",
  "S.G.O.T.(AST)", "S.G.P.T.(ALT)", "S.Alkaline Phosphatase",
  "S.Acid Phosphatase Total", "Lipase", "S.Proteins Total", "S.Albumin",
  "S.Globulin", "S.Uric Acid", "S.Calcium", "S.Amylase", "S.Phosphorus",
  "S.Sodium", "S.Potassium", "S.Chloride", "C.P.K.", "Blood Urea Nitrogen",
  "V.L.D.L.Cholesterol", "Albumin", "Packed Cell Volume", "Glyco.Haemoglobin",
];

const keys = new Set(Object.keys(CATALOGUE_PARAMETERS).map(normaliseTestName));

describe("catalogue parameters", () => {
  it("covers every test the lab PC reported as un-enterable", () => {
    const missing = STRANDED_ON_THE_LAB_PC.filter((n) => !keys.has(normaliseTestName(n)));
    expect(missing).toEqual([]);
  });

  // "Total WBC Count" and "Total WBC count" are separate rows in the imported
  // catalogue. Matching has to be case- and spacing-insensitive or half of them
  // stay empty.
  it("matches names regardless of case and spacing", () => {
    expect(normaliseTestName("Total WBC Count")).toBe(normaliseTestName("total wbc  count"));
    expect(keys.has(normaliseTestName("HIV I  & II"))).toBe(true);
    expect(keys.has(normaliseTestName("E.S.R.(Westergren )"))).toBe(true);
  });

  it("gives every entry at least one parameter with a unit field", () => {
    for (const [test, specs] of Object.entries(CATALOGUE_PARAMETERS)) {
      expect(specs.length, `${test} has no parameters`).toBeGreaterThan(0);
      for (const p of specs) {
        expect(typeof p.name, `${test} parameter name`).toBe("string");
        expect(p.name.length, `${test} parameter name empty`).toBeGreaterThan(0);
        expect(typeof p.unit, `${test} parameter unit`).toBe("string");
      }
    }
  });

  // A range that reads max < min would flag every result abnormal.
  it("never states a maximum below its minimum", () => {
    for (const [test, specs] of Object.entries(CATALOGUE_PARAMETERS)) {
      for (const p of specs) {
        if (p.maleMin !== undefined && p.maleMax !== undefined) {
          expect(p.maleMax, `${test} / ${p.name} male range`).toBeGreaterThanOrEqual(p.maleMin);
        }
        if (p.femaleMin !== undefined && p.femaleMax !== undefined) {
          expect(p.femaleMax, `${test} / ${p.name} female range`).toBeGreaterThanOrEqual(
            p.femaleMin,
          );
        }
      }
    }
  });

  // A qualitative parameter whose "normal" is not one of its own options can
  // never match, so every result would read abnormal.
  it("only calls a qualitative result normal if it is one of the options", () => {
    for (const [test, specs] of Object.entries(CATALOGUE_PARAMETERS)) {
      for (const p of specs) {
        if (p.normal) {
          expect(p.options, `${test} / ${p.name} has a normal but no options`).toBeDefined();
          expect(p.options, `${test} / ${p.name}`).toContain(p.normal);
        }
      }
    }
  });

  // Sex-specific intervals exist for these because the physiology differs;
  // losing that would under-report anaemia in men and over-report it in women.
  it("keeps the sex-specific ranges that have them", () => {
    const hb = CATALOGUE_PARAMETERS["haemoglobin"]![0]!;
    expect(hb.maleMin).toBe(13);
    expect(hb.femaleMin).toBe(12);

    const creat = CATALOGUE_PARAMETERS["s.creatinine"]![0]!;
    expect(creat.maleMax).toBe(1.2);
    expect(creat.femaleMax).toBe(1.1);
  });
});
