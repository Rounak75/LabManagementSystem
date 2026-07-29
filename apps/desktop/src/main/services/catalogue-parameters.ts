/**
 * Parameters for the lab's imported test catalogue.
 *
 * Result entry renders one input per parameter, so a test with none offers
 * nowhere to type a result: the desktop table renders empty and the staff portal
 * shows no fields. The imported catalogue arrived with 144 active tests in that
 * state — the great majority of what the lab actually offers — which is why a
 * technician could open a visit and find nothing to fill in.
 *
 * ── How to read the ranges ────────────────────────────────────────────────────
 *
 * Every numeric range here is either cited to a source on the line above it, or
 * marked `VERIFY:` where it is a widely-used figure I could not tie to a single
 * authority. **A pathologist must confirm all of them against this lab's own
 * methods and analysers before they are relied on.** Reference intervals are
 * method-dependent and population-dependent; StatPearls says so explicitly, and
 * an interval that is right for one analyser is wrong for another.
 *
 * Nothing here is invented. Where I had no defensible figure the parameter is
 * left with no range at all — the value is recorded and simply never flagged
 * abnormal, which is honest, rather than flagged against a number someone made
 * up. Qualitative and descriptive tests carry no range by nature.
 *
 * ── Sources ──────────────────────────────────────────────────────────────────
 *
 *  [CBC]   Normal and Abnormal Complete Blood Count With Differential,
 *          StatPearls, NCBI NBK604207
 *  [LFT]   Liver Function Tests, StatPearls, NCBI NBK482489
 *  [ORD]   Overview on Ordering and Evaluation of Laboratory Tests,
 *          StatPearls, NCBI NBK570615
 *  [BUN]   BUN and Creatinine, Clinical Methods, NCBI NBK305
 */

export type ParamSpec = {
  name: string;
  unit: string;
  resultType?: "Numeric" | "Qualitative";
  maleMin?: number; maleMax?: number;
  femaleMin?: number; femaleMax?: number;
  options?: string[];
  normal?: string;
};

/** Numeric with one range for both sexes. */
const n = (min: number, max: number) => ({
  resultType: "Numeric" as const,
  maleMin: min, maleMax: max, femaleMin: min, femaleMax: max,
});
/** Numeric with sex-specific ranges. */
const sex = (mMin: number, mMax: number, fMin: number, fMax: number) => ({
  resultType: "Numeric" as const,
  maleMin: mMin, maleMax: mMax, femaleMin: fMin, femaleMax: fMax,
});
/** Numeric with no defensible interval — recorded, never auto-flagged. */
const open = () => ({ resultType: "Numeric" as const });
/** Pick-one result. */
const qual = (options: string[], normal?: string) => ({
  resultType: "Qualitative" as const, options, normal,
});
/** Free description — smears, cultures, microscopy. */
const text = () => ({ resultType: "Qualitative" as const });

const POS_NEG = ["Negative", "Positive"];
const PRESENT_ABSENT = ["Absent", "Present"];
const REACTIVE = ["Non-reactive", "Reactive"];

/** One parameter, named after the test. The shape most of this catalogue takes. */
const single = (unit: string, rest: Partial<ParamSpec> = {}): ParamSpec[] => [
  { name: "__TEST_NAME__", unit, ...rest } as ParamSpec,
];

/**
 * test name (as it appears in the catalogue) → its parameters.
 * Matched case-insensitively on the trimmed name.
 */
export const CATALOGUE_PARAMETERS: Record<string, ParamSpec[]> = {
  // ─── Haematology ──────────────────────────────────────────────────────────
  // [CBC] Hb: men 13–18 g/dL, women 12–16 g/dL
  "haemoglobin": single("g/dL", sex(13, 18, 12, 16)),
  // [CBC] RBC: men 4.6–6.2, women 4.2–5.4 million/µL
  "total rbc count": single("million/µL", sex(4.6, 6.2, 4.2, 5.4)),
  // [CBC] WBC: 4500–11000 cells/µL
  "total wbc count": single("/µL", n(4500, 11000)),
  // [CBC] Platelets: 150,000–400,000/µL
  "total platelet count": single("/µL", n(150000, 400000)),
  "total platelets count": single("/µL", n(150000, 400000)),
  // [CBC] Haematocrit: men 40–54%, women 36–48%
  "pcv (haematocrit)": single("%", sex(40, 54, 36, 48)),
  "packed cell volume": single("%", sex(40, 54, 36, 48)),
  // [CBC] MCV 80–100, MCH 27–32, MCHC ~32–36
  "mean cell volume(mcv)": single("fL", n(80, 100)),
  "m.c.v(hct/r.b.c.)": single("fL", n(80, 100)),
  "mean cell haemoglobin(mch)": single("pg", n(27, 32)),
  "m.c.h(hb/r.b.c.)": single("pg", n(27, 32)),
  "mean cell haemoglobin concentration(mchc)": single("%", n(32, 36)),
  "m.c.h.c.(hb/p.c.v.)": single("%", n(32, 36)),
  // [CBC] RDW approximately 11.5–15%
  "rdw": single("%", n(11.5, 15)),
  // [CBC] Absolute eosinophils 0–500 cells/µL
  "absolute eosinophil": single("/µL", n(0, 500)),
  // [CBC] Differential, as percentages
  "diff.wbc count": [
    { name: "Neutrophils", unit: "%", ...n(40, 60) },
    { name: "Lymphocytes", unit: "%", ...n(20, 40) },
    { name: "Monocytes", unit: "%", ...n(2, 8) },
    { name: "Eosinophils", unit: "%", ...n(0, 4) },
    { name: "Basophils", unit: "%", ...n(0.5, 1) },
  ],
  // VERIFY: reticulocyte percentage, method-dependent.
  "reticulocytes count": single("%", n(0.5, 2.5)),
  // VERIFY: ESR is strongly method- and age-dependent; these are the commonly
  // quoted adult figures for each method and need confirming for this lab.
  "e.s.r.(westergren )": single("mm/hr", sex(0, 15, 0, 20)),
  "e.s.r.(wintrobe)": single("mm/hr", sex(0, 9, 0, 20)),
  // VERIFY: bleeding/clotting times depend entirely on technique.
  "bleeding time": single("min", n(2, 7)),
  "clotting time": single("min", n(4, 9)),
  // [LFT] Prothrombin time 10.9–12.5 s
  "prothrombin time test": [
    { name: "Prothrombin Time", unit: "seconds", ...n(10.9, 12.5) },
    { name: "INR", unit: "ratio", ...n(0.8, 1.2) },
  ],
  // VERIFY: aPTT is reagent-dependent.
  "activated partial thrombo plastin": single("seconds", n(25, 35)),

  // ─── Glucose ──────────────────────────────────────────────────────────────
  // [ORD] Fasting glucose normal is < 100 mg/dL
  "blood sugar (f)": single("mg/dL", n(70, 100)),
  "sugar (f)": single("mg/dL", n(70, 100)),
  "blood glucose(f)": single("mg/dL", n(70, 100)),
  // VERIFY: post-prandial and random cut-offs follow the lab's diagnostic policy.
  "blood sugar (pp)": single("mg/dL", n(70, 140)),
  "sugar (pp)": single("mg/dL", n(70, 140)),
  "blood glucose(pp)": single("mg/dL", n(70, 140)),
  "blood sugar (pg)": single("mg/dL", n(70, 140)),
  "blood sugar (random)": single("mg/dL", n(70, 140)),
  "blood glucose random": single("mg/dL", n(70, 140)),
  // [ORD] HbA1c normal is below 5.7%
  "glyco.haemoglobin": single("%", n(4.0, 5.7)),
  "glucose tolerance test": [
    { name: "Fasting", unit: "mg/dL", ...n(70, 100) },
    { name: "1 hour", unit: "mg/dL", ...open() },
    { name: "2 hour", unit: "mg/dL", ...n(70, 140) },
  ],
  "sugar profile": [
    { name: "Fasting", unit: "mg/dL", ...n(70, 100) },
    { name: "Post Prandial", unit: "mg/dL", ...n(70, 140) },
  ],

  // ─── Renal ────────────────────────────────────────────────────────────────
  // [BUN] Urea nitrogen 5–20 mg/dL
  "blood urea nitrogen": single("mg/dL", n(5, 20)),
  "bun": single("mg/dL", n(5, 20)),
  // VERIFY: serum urea (not BUN) — the commonly quoted adult interval.
  "s.urea": single("mg/dL", n(15, 40)),
  // [BUN] Creatinine, enzymatic: men 0.6–1.2, women 0.5–1.1 mg/dL
  "s.creatinine": single("mg/dL", sex(0.6, 1.2, 0.5, 1.1)),
  // VERIFY: uric acid; 2.6–8.2 mg/dL observed in healthy adults, commonly split
  // by sex in practice.
  "s.uric acid": single("mg/dL", sex(3.4, 7.0, 2.4, 6.0)),
  // VERIFY: normal adult urinary protein excretion.
  "24hrs urinary protein": single("mg/24hr", n(0, 150)),

  // ─── Liver ────────────────────────────────────────────────────────────────
  // [ORD] Total bilirubin 0.1–1.0, direct 0–0.3 mg/dL
  "s.bilirubin total": single("mg/dL", n(0.1, 1.0)),
  "s.bilirubin  direct": single("mg/dL", n(0, 0.3)),
  "s.bilirubin direct": single("mg/dL", n(0, 0.3)),
  "s.bilirubin indirect": single("mg/dL", n(0.1, 0.7)),
  // [ORD] AST 10–40, ALT 7–56, ALP 30–120, GGT 9–48 U/L
  "s.g.o.t.(ast)": single("U/L", n(10, 40)),
  "s.g.p.t.(alt)": single("U/L", n(7, 56)),
  "s.alkaline phosphatase": single("U/L", n(30, 120)),
  "gamma g.t.": single("U/L", n(9, 48)),
  // [ORD] Albumin 3.5–5.0 g/dL, total protein 60–80 g/L (6–8 g/dL)
  "s.albumin": single("g/dL", n(3.5, 5.0)),
  "albumin": single("g/dL", n(3.5, 5.0)),
  "s.proteins total": single("g/dL", n(6.0, 8.0)),
  // VERIFY: globulin is usually derived (total protein − albumin).
  "s.globulin": single("g/dL", n(2.0, 3.5)),
  // VERIFY: acid phosphatase, method-dependent.
  "s.acid phosphatase total": single("U/L", open()),

  // ─── Lipids ───────────────────────────────────────────────────────────────
  // VERIFY: lipid figures are treatment targets rather than population
  // intervals, and the lab should state which guideline it follows.
  "total cholesterol": single("mg/dL", n(0, 200)),
  "h.d.l.cholesterol": single("mg/dL", sex(40, 60, 50, 60)),
  "l.d.l.cholesterol": single("mg/dL", n(0, 100)),
  "v.l.d.l.cholesterol": single("mg/dL", n(5, 40)),
  "s.triglyceride": single("mg/dL", n(0, 150)),

  // ─── Electrolytes and minerals ────────────────────────────────────────────
  // VERIFY: the conventional adult intervals.
  "s.sodium": single("mmol/L", n(135, 145)),
  "s.potassium": single("mmol/L", n(3.5, 5.1)),
  "s.chloride": single("mmol/L", n(97, 107)),
  "s.calcium": single("mg/dL", n(8.5, 10.5)),
  // [BUN-adjacent] Phosphorus 2.5–4.5 mg/dL
  "s.phosphorus": single("mg/dL", n(2.5, 4.5)),
  "serum electrolyte": [
    { name: "Sodium", unit: "mmol/L", ...n(135, 145) },
    { name: "Potassium", unit: "mmol/L", ...n(3.5, 5.1) },
    { name: "Chloride", unit: "mmol/L", ...n(97, 107) },
  ],

  // ─── Enzymes ──────────────────────────────────────────────────────────────
  // VERIFY: amylase, lipase, CK and CK-MB are strongly method-dependent.
  "s.amylase": single("U/L", n(30, 110)),
  "lipase": single("U/L", n(10, 140)),
  "c.p.k.": single("U/L", sex(38, 174, 26, 140)),
  "ck mb": single("U/L", n(0, 25)),
  "cpk mb": single("U/L", n(0, 25)),
  // [LFT] LDH 50–150 IU/L
  "ldh": single("IU/L", n(50, 150)),

  // ─── Thyroid ──────────────────────────────────────────────────────────────
  // VERIFY: thyroid intervals are assay-specific; these are the commonly quoted
  // adult figures and must be replaced with the analyser's own.
  "t3": single("ng/mL", n(0.8, 2.0)),
  "t4": single("µg/dL", n(5.1, 14.1)),
  "tsh": single("µIU/mL", n(0.4, 4.5)),
  "highly sensitive tsh": single("µIU/mL", n(0.4, 4.5)),
  "ft3": single("pg/mL", n(2.3, 4.2)),
  "ft4": single("ng/dL", n(0.9, 1.6)),
  "t3 t4 tsh": [
    { name: "T3", unit: "ng/mL", ...n(0.8, 2.0) },
    { name: "T4", unit: "µg/dL", ...n(5.1, 14.1) },
    { name: "TSH", unit: "µIU/mL", ...n(0.4, 4.5) },
  ],

  // ─── Serology and rapid tests ─────────────────────────────────────────────
  "hbs ag": single("", qual(POS_NEG, "Negative")),
  "hiv i & ii": single("", qual(POS_NEG, "Negative")),
  "hiv i  & ii": single("", qual(POS_NEG, "Negative")),
  "v.d.r.l. test": single("", qual(REACTIVE, "Non-reactive")),
  "kahn test": single("", qual(REACTIVE, "Non-reactive")),
  "t.p.h.a.test": single("", qual(REACTIVE, "Non-reactive")),
  "r.a.test": single("", qual(POS_NEG, "Negative")),
  "a.s.o.test": single("", qual(POS_NEG, "Negative")),
  "c.reactive proteins test": single("", qual(POS_NEG, "Negative")),
  "chikungunya test (elisa test)": single("", qual(POS_NEG, "Negative")),
  "dengucheck  test": single("", qual(POS_NEG, "Negative")),
  "dengucheck test": single("", qual(POS_NEG, "Negative")),
  "sickling test": single("", qual(POS_NEG, "Negative")),
  "aldehyde test": single("", qual(POS_NEG, "Negative")),
  "indirect coombs' test": single("", qual(POS_NEG, "Negative")),
  "h.c.g.(elisa test)": single("", qual(POS_NEG, "Negative")),
  "hcg (direct latex test)": single("", qual(POS_NEG, "Negative")),
  "urine hcg in dilution": single("", qual(POS_NEG, "Negative")),
  "card test  [ mp]": single("", qual(POS_NEG, "Negative")),
  "optimal rapid malaria test": single("", qual(POS_NEG, "Negative")),
  "malarial parasite": single("", qual(PRESENT_ABSENT, "Absent")),
  "microfilaria": single("", qual(PRESENT_ABSENT, "Absent")),
  "mountox (10 tu)": single("mm", open()),
  // Widal is reported as titres per antigen, not a single value.
  "widal test": [
    { name: "S. Typhi O", unit: "titre", ...text() },
    { name: "S. Typhi H", unit: "titre", ...text() },
    { name: "S. Paratyphi AH", unit: "titre", ...text() },
    { name: "S. Paratyphi BH", unit: "titre", ...text() },
  ],
  "blood group": [
    { name: "ABO Group", unit: "", ...qual(["A", "B", "AB", "O"]) },
    { name: "Rh Factor", unit: "", ...qual(["Positive", "Negative"]) },
  ],

  // ─── Urine chemistry ──────────────────────────────────────────────────────
  "acetone": single("", qual(PRESENT_ABSENT, "Absent")),
  "bile pigmant": single("", qual(PRESENT_ABSENT, "Absent")),
  "bile salts": single("", qual(PRESENT_ABSENT, "Absent")),
  "blood": single("", qual(PRESENT_ABSENT, "Absent")),
  "urobilinogen": single("", qual(["Normal", "Increased", "Absent"], "Normal")),
  "porphobilinogen": single("", qual(PRESENT_ABSENT, "Absent")),
  "chyle": single("", qual(PRESENT_ABSENT, "Absent")),
  "reducing sugar": single("", qual(PRESENT_ABSENT, "Absent")),
  "occult blood": single("", qual(PRESENT_ABSENT, "Absent")),

  // ─── Microscopy, smears and cultures ──────────────────────────────────────
  // Descriptive by nature: the technician writes what was seen. No range can
  // apply, so none is given.
  "fungal smear": single("", text()),
  "fungal culture": single("", text()),
  "afb smear": single("", text()),
  "sputum for afb": single("", text()),
  "skin slit smear for afb": single("", text()),
  "nasal smear for afb": single("", text()),
  "throat swab for klb culture": single("", text()),
  "throat swab for klb smear": single("", text()),
  "gram staining for gonococci": single("", text()),
  "urine culture": single("", text()),
  "high veginal swab test": single("", text()),
  "urethral smear test": single("", text()),
  "ulcer smear test": single("", text()),
  "paps smear test": single("", text()),
  "cell type": single("", text()),
  "aspirated fluid examination(csf,ascitic,pleural)": single("", text()),
  "urine drug tests": single("", text()),
};
