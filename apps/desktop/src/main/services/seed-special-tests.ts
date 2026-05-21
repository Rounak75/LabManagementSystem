import type { PrismaClient } from "@prisma/client";
import { seedOne, type Param, type Seed } from "@main/services/seed-golmuri-tests";

const qual = (opts: string[], normal?: string): Pick<Param, "resultType" | "qualitativeOptions" | "normalQualitative"> => ({
  resultType: "Qualitative",
  qualitativeOptions: JSON.stringify(opts),
  normalQualitative: normal ?? null
});

const SEROLOGY_AND_OTHER: Seed[] = [
  { name: "VDRL", category: "Blood", price: 150, parameters: [
    { name: "Result", unit: "", ...qual(["Reactive","Non-reactive","Kahn"], "Non-reactive") },
    { name: "Titer",  unit: "", resultType: "Qualitative",
      qualitativeOptions: JSON.stringify(["—","1:1","1:2","1:4","1:8","1:16","1:32","1:64"]) }
  ]},
  { name: "Blood Group", category: "Blood", price: 50, parameters: [
    { name: "ABO",          unit: "", ...qual(["A","B","AB","O"]) },
    { name: "Rh (Anti-D)",  unit: "", ...qual(["Positive","Negative"]) }
  ]},
  { name: "RA Factor", category: "Blood", price: 200, parameters: [
    { name: "Result", unit: "",       ...qual(["Positive","Negative"], "Negative") },
    { name: "Titer",  unit: "IU/ml",  resultType: "Numeric" }
  ]},
  { name: "ASO", category: "Blood", price: 200, parameters: [
    { name: "Value", unit: "IU/ml", resultType: "Numeric", refRangeMaleMin: 0, refRangeMaleMax: 200, refRangeFemaleMin: 0, refRangeFemaleMax: 200 }
  ]},
  { name: "HBsAg",   category: "Blood", price: 250, parameters: [{ name: "Result", unit: "", ...qual(["Positive","Negative"], "Negative") }] },
  { name: "HIV 1/2", category: "Blood", price: 300, parameters: [{ name: "Result", unit: "", ...qual(["Reactive HIV-1","Reactive HIV-2","Non-reactive"], "Non-reactive") }] },
  { name: "HCV",     category: "Blood", price: 300, parameters: [{ name: "Result", unit: "", ...qual(["Positive","Negative"], "Negative") }] },
  { name: "MP Blood Film", category: "Blood", price: 100, parameters: [{ name: "Result", unit: "", ...qual(["Positive PV","Positive PF","Mixed","Negative"], "Negative") }] },
  { name: "MP Card",       category: "Blood", price: 200, parameters: [{ name: "Result", unit: "", ...qual(["Positive","Negative"], "Negative") }] },
  { name: "Dengue IgG/IgM", category: "Blood", price: 400, parameters: [
    { name: "IgG", unit: "", ...qual(["Positive","Negative"], "Negative") },
    { name: "IgM", unit: "", ...qual(["Positive","Negative"], "Negative") }
  ]},
  { name: "Sickling Test", category: "Blood", price: 150, parameters: [{ name: "Result", unit: "", ...qual(["Positive","Negative"], "Negative") }] },
  { name: "Mantoux Test",  category: "Blood", price: 200, parameters: [
    { name: "Induration",     unit: "mm", resultType: "Numeric" },
    { name: "Interpretation", unit: "",   ...qual(["Positive (>=10 mm)","Negative"], "Negative") }
  ]},
  { name: "PT (Prothrombin Time)", category: "Blood", price: 200, parameters: [
    { name: "PT",  unit: "sec", resultType: "Numeric", refRangeMaleMin: 11,  refRangeMaleMax: 13.5, refRangeFemaleMin: 11,  refRangeFemaleMax: 13.5 },
    { name: "INR", unit: "",    resultType: "Numeric", refRangeMaleMin: 0.9, refRangeMaleMax: 1.2,  refRangeFemaleMin: 0.9, refRangeFemaleMax: 1.2 }
  ]},
  { name: "CRP", category: "Blood", price: 200, parameters: [
    { name: "Value", unit: "mg/L", resultType: "Numeric", refRangeMaleMin: 0, refRangeMaleMax: 6, refRangeFemaleMin: 0, refRangeFemaleMax: 6 }
  ]},
  { name: "Direct Coombs Test", category: "Blood", price: 250, parameters: [{ name: "Result", unit: "", ...qual(["Positive","Negative"], "Negative") }] },
  { name: "Peripheral Blood Smear", category: "Blood", price: 200, parameters: [
    { name: "Comment", unit: "", resultType: "Qualitative", qualitativeOptions: JSON.stringify(["Normal","Abnormal - see notes"]) }
  ]},
  { name: "Sputum for AFB", category: "Other", price: 200, parameters: [{ name: "Result", unit: "", ...qual(["Positive","Negative","Not seen"], "Negative") }] },
  { name: "Semen Examination", category: "Other", price: 300, parameters: [
    { name: "Age of Specimen", unit: "",            resultType: "Qualitative", qualitativeOptions: JSON.stringify(["<1 hr","1-2 hr","2-3 hr",">3 hr"]) },
    { name: "Quantity",        unit: "ml",          resultType: "Numeric", refRangeMaleMin: 1.5, refRangeMaleMax: 6 },
    { name: "Consistency",     unit: "",            ...qual(["Viscous","Semi-viscous","Watery"]) },
    { name: "Reaction",        unit: "",            ...qual(["Acidic","Alkaline","Neutral"], "Alkaline") },
    { name: "Motility",            unit: "%",       resultType: "Numeric", refRangeMaleMin: 40, refRangeMaleMax: 100 },
    { name: "Actively Motile",     unit: "%",       resultType: "Numeric" },
    { name: "Sluggish",            unit: "%",       resultType: "Numeric" },
    { name: "Non-Motile",          unit: "%",       resultType: "Numeric" },
    { name: "Abnormal Spermatozoa", unit: "%",      resultType: "Numeric", refRangeMaleMin: 0,  refRangeMaleMax: 30 },
    { name: "Sperm Count",         unit: "Million/ml", resultType: "Numeric", refRangeMaleMin: 15, refRangeMaleMax: 200 }
  ]}
];

const SPECIAL_TESTS: Seed[] = [
  { name: "Widal Test", category: "Blood", price: 200, parameters: [
    { name: "Titer Grid", unit: "", resultType: "TiterGrid",
      qualitativeOptions: JSON.stringify({ antigens: ["O","H","AH","BH"], dilutions: ["1:20","1:40","1:80","1:160","1:320"] }) },
    { name: "Opinion", unit: "", resultType: "Qualitative",
      qualitativeOptions: JSON.stringify(["Negative","Suggestive of Typhoid"]) }
  ]},
  { name: "Culture & Sensitivity Test", category: "Other", price: 500, parameters: [
    { name: "Culture Sample",     unit: "", resultType: "Qualitative",
      qualitativeOptions: JSON.stringify(["Urine","Blood","Sputum","Pus","Stool","Other"]) },
    { name: "Organism Isolated",  unit: "", resultType: "Qualitative",
      qualitativeOptions: JSON.stringify(["No growth","E. coli","Klebsiella","Staph. aureus","Pseudomonas","Proteus","Other"]) },
    { name: "Sensitivity Grid",   unit: "", resultType: "SensitivityGrid",
      qualitativeOptions: JSON.stringify({ drugs: [
        "Penicillin","Streptomycin","Terramycin","Co-trimoxazole","Erythromycin","Azithromycin","Roxithromycin",
        "Chloramphenicol","Ampicillin","Amoxycillin","Amikacin","Gentamycin","Nalidixic acid","Nitrofurantoin",
        "Norfloxacin","Ciprofloxacin","Ofloxacin","Pefloxacin","Lomefloxacin","Levofloxacin","Sparfloxacin",
        "Gatifloxacin","Cephalexin","Cefazoline","Cefotaxime","Cefadroxyl","Doxycycline"
      ]}) }
  ]}
];

/** Number of tests this module seeds — used by the boot guard to skip when already seeded. */
export const SPECIAL_SEED_COUNT = SEROLOGY_AND_OTHER.length + SPECIAL_TESTS.length;

export async function seedSpecialTests(prisma: PrismaClient): Promise<void> {
  for (const seed of [...SEROLOGY_AND_OTHER, ...SPECIAL_TESTS]) {
    await seedOne(prisma, seed);
  }
}
