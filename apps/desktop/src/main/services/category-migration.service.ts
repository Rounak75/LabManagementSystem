import { prisma } from "@main/db";
import { TEST_CATEGORIES, type TestCategory } from "@lab/types";

const LEGACY_CATEGORIES = new Set(["Blood", "Urine", "Stool"]);

// Keyword → section. Order matters: more specific rules first.
const RULES: { match: RegExp; category: TestCategory }[] = [
  { match: /\b(culture|sensitivity|mantoux|afb|sputum)\b/i, category: "Microbiology" },
  { match: /\b(pap\s*smear|fnac|cytolog)/i, category: "Cytology" },
  { match: /\b(vdrl|hbsag|hiv|hcv|widal|aso|ra\s*factor|rheumatoid|crp|dengue|blood\s*group|malaria|mp|typhoid|troponin|tsh|t3|t4|thyroid|coombs)\b/i, category: "Serology" },
  { match: /\b(stool)/i, category: "Stool Routine" },
  { match: /\b(urine)/i, category: "Urine Routine" },
  { match: /\b(cbc|complete\s*blood|hemoglobin|haemoglobin|\bhb\b|rbc|wbc|platelet|esr|pcv|mcv|mch|mchc|reticulocyte|differential|bleeding\s*time|clotting\s*time|peripheral\s*blood)\b/i, category: "Hematology" },
  { match: /\b(glucose|sugar|cholesterol|hdl|ldl|vldl|triglyceride|urea|creatinine|bilirubin|sgpt|sgot|\balt\b|\bast\b|alkaline\s*phosphatase|\balp\b|protein|albumin|globulin|calcium|sodium|potassium|chloride|uric\s*acid|amylase|lipase|phosphor|magnesium|lipid|\blft\b|\bkft\b|\brft\b|electrolyte|iron|ferritin|hba1c)\b/i, category: "Clinical Biochemistry" }
];

function inferCategory(name: string, oldCategory: string): TestCategory {
  for (const rule of RULES) if (rule.match.test(name)) return rule.category;
  if (oldCategory === "Blood")  return "Hematology";
  if (oldCategory === "Urine")  return "Urine Routine";
  if (oldCategory === "Stool")  return "Stool Routine";
  return "Other";
}

export async function migrateTestCategoriesOnce(): Promise<void> {
  try {
    const tests = await prisma().test.findMany({ select: { id: true, name: true, category: true } });
    const valid = new Set<string>(TEST_CATEGORIES);
    const updates = tests
      .filter(t => LEGACY_CATEGORIES.has(t.category) || !valid.has(t.category))
      .map(t => ({ id: t.id, next: inferCategory(t.name, t.category) }))
      .filter(u => valid.has(u.next));
    if (updates.length === 0) return;
    await prisma().$transaction(updates.map(u =>
      prisma().test.update({ where: { id: u.id }, data: { category: u.next } })
    ));
    console.log(`[migrateTestCategoriesOnce] Updated ${updates.length} tests to new categories`);
  } catch (err) {
    console.error("[migrateTestCategoriesOnce] failed:", err);
  }
}
