import { prisma } from "@main/db";
import { CATALOGUE_PARAMETERS, type ParamSpec } from "./catalogue-parameters";

/**
 * Gives every parameterless test in the catalogue something to type a result
 * into.
 *
 * Only ever ADDS, and only to a test that has no parameters at all. A test the
 * lab has already set up by hand is left exactly as it is — this must never
 * overwrite a range a pathologist chose. That also makes it safe to run on every
 * boot: once a test has parameters it is skipped forever after.
 *
 * A test still absent from the map after this runs is reported by the
 * reconciliation log, so the gap is visible rather than discovered by a
 * technician with a patient waiting.
 */

/** The placeholder used in the map for "one parameter, named after the test". */
const TEST_NAME_TOKEN = "__TEST_NAME__";

export function normaliseTestName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ApplyStats {
  testsGivenParameters: number;
  parametersCreated: number;
}

export async function applyCatalogueParameters(): Promise<ApplyStats> {
  const stats: ApplyStats = { testsGivenParameters: 0, parametersCreated: 0 };

  const stranded = await prisma().test.findMany({
    where: { isActive: true, parameters: { none: {} } },
    select: { id: true, name: true },
  });
  if (stranded.length === 0) return stats;

  // Keys are normalised once rather than per test, so a stray double space in
  // either the map or the catalogue does not silently miss a match.
  const byName = new Map<string, ParamSpec[]>();
  for (const [key, specs] of Object.entries(CATALOGUE_PARAMETERS)) {
    byName.set(normaliseTestName(key), specs);
  }

  for (const test of stranded) {
    const specs = byName.get(normaliseTestName(test.name));
    if (!specs || specs.length === 0) continue;

    let order = 0;
    for (const spec of specs) {
      await prisma().testParameter.create({
        data: {
          testId: test.id,
          // A single-parameter test is named after the test itself, which is how
          // it reads on the report: "Haemoglobin  12.4 g/dL".
          name: spec.name === TEST_NAME_TOKEN ? test.name : spec.name,
          unit: spec.unit,
          resultType: spec.resultType ?? "Numeric",
          refRangeMaleMin: spec.maleMin ?? null,
          refRangeMaleMax: spec.maleMax ?? null,
          refRangeFemaleMin: spec.femaleMin ?? null,
          refRangeFemaleMax: spec.femaleMax ?? null,
          qualitativeOptions: spec.options ? JSON.stringify(spec.options) : null,
          normalQualitative: spec.normal ?? null,
          displayOrder: order++,
        },
      });
      stats.parametersCreated += 1;
    }
    stats.testsGivenParameters += 1;
  }

  return stats;
}
