import { prisma } from "@main/db";
import { seedPanelTests } from "@main/services/seed-panels";
import { applyCatalogueParameters } from "@main/services/apply-catalogue-parameters";

/**
 * Reconciles the test catalogue: makes every test capable of holding a result,
 * and retires the duplicates.
 *
 * Twelve of the seventy-two active tests had zero TestParameter rows. Result
 * entry is driven entirely by parameters, so those tests rendered no input at
 * all — the desktop table had no rows, and the admin app showed "No parameters
 * defined for this test." A booked visit against one of them could never be
 * completed.
 *
 * All twelve came from the starter list in packages/db/src/seed.ts, which
 * predates seed-golmuri-tests.ts and duplicates it. Five were really panels
 * (Lipid/LFT/KFT/Thyroid/ESR) and are built out properly in seed-panels.ts. The
 * other seven are straight duplicates of a test that already works.
 *
 * This does NOT repoint historical VisitTest rows onto the canonical test. A
 * visit billed as "Blood Sugar Fasting" at its own price must keep printing and
 * reconciling as that test; silently moving it would rewrite billing history.
 * Instead the duplicate keeps its identity, gains its twin's parameters so any
 * already-booked visit can still be completed, and is deactivated so nothing new
 * is booked against it.
 *
 * Runs every boot and is a no-op once reconciled. Deliberately does NOT sit
 * behind the `testCount < EXPECTED_SEED_TEST_COUNT` guard in index.ts: an
 * existing install already has more tests than that threshold, so anything
 * behind it never runs again.
 */

/** legacy name → the already-parameterised test it duplicates. */
const DUPLICATE_MERGES: ReadonlyArray<{ legacy: string; canonical: string }> = [
  { legacy: "Blood Sugar Fasting",        canonical: "Blood Glucose Fasting" },
  { legacy: "Blood Sugar PP",             canonical: "PP Glucose" },
  { legacy: "Complete Blood Count (CBC)", canonical: "CBC / Blood Examination" },
  { legacy: "Urine Routine",              canonical: "Urine Routine Examination" },
  { legacy: "Urine Culture",              canonical: "Culture & Sensitivity Test" },
  { legacy: "Dengue Card",                canonical: "Dengue IgG/IgM" },
  { legacy: "Malaria Card",               canonical: "MP Card" },
];

/**
 * Copies a canonical test's parameters onto a duplicate that has none, so a
 * visit already booked against the duplicate can still have its result entered.
 */
async function adoptParametersFrom(legacyTestId: string, canonicalTestId: string): Promise<number> {
  const source = await prisma().testParameter.findMany({
    where: { testId: canonicalTestId },
    orderBy: { displayOrder: "asc" },
  });
  if (source.length === 0) return 0;

  let created = 0;
  for (const p of source) {
    const exists = await prisma().testParameter.findFirst({
      where: { testId: legacyTestId, name: p.name },
    });
    if (exists) continue;
    await prisma().testParameter.create({
      data: {
        testId: legacyTestId,
        name: p.name,
        unit: p.unit,
        resultType: p.resultType,
        displayOrder: p.displayOrder,
        refRangeMaleMin: p.refRangeMaleMin,
        refRangeMaleMax: p.refRangeMaleMax,
        refRangeFemaleMin: p.refRangeFemaleMin,
        refRangeFemaleMax: p.refRangeFemaleMax,
        refRangeChildMin: p.refRangeChildMin,
        refRangeChildMax: p.refRangeChildMax,
        qualitativeOptions: p.qualitativeOptions,
        normalQualitative: p.normalQualitative,
        computeRule: p.computeRule,
      },
    });
    created++;
  }
  return created;
}

export async function reconcileTestCatalogueOnce(): Promise<void> {
  try {
    // 1. Build out the real panels. seedOne matches on name, so where the
    //    parameterless starter row already exists this attaches parameters to
    //    it rather than creating a second test.
    await seedPanelTests(prisma());

    // 2. Retire the straight duplicates, but only after they can hold a result.
    for (const { legacy, canonical } of DUPLICATE_MERGES) {
      const legacyTest = await prisma().test.findFirst({ where: { name: legacy } });
      if (!legacyTest) continue;

      const canonicalTest = await prisma().test.findFirst({ where: { name: canonical } });
      if (!canonicalTest) {
        console.warn(`[reconcileTestCatalogue] canonical "${canonical}" missing; leaving "${legacy}" active`);
        continue;
      }

      const adopted = await adoptParametersFrom(legacyTest.id, canonicalTest.id);
      if (adopted > 0) {
        console.log(`[reconcileTestCatalogue] "${legacy}" adopted ${adopted} parameters from "${canonical}"`);
      }

      // Deactivate only once it can actually hold a result, so a pending visit
      // is never left both un-enterable and invisible.
      const hasParams = await prisma().testParameter.count({ where: { testId: legacyTest.id } });
      if (legacyTest.isActive && hasParams > 0) {
        await prisma().test.update({ where: { id: legacyTest.id }, data: { isActive: false } });
        console.log(`[reconcileTestCatalogue] deactivated duplicate "${legacy}" (use "${canonical}")`);
      }
    }

    // 3. Give the imported catalogue its parameters. seedPanelTests above knows
    //    five panels; the lab's real catalogue arrived with 144 active tests
    //    that had none at all, which is why result entry rendered no inputs for
    //    most of what the lab offers. Only ever adds, and only to a test with no
    //    parameters, so anything set up by hand is left alone.
    const applied = await applyCatalogueParameters();
    if (applied.testsGivenParameters > 0) {
      console.log(
        `[reconcileTestCatalogue] gave ${applied.parametersCreated} parameter(s) to ` +
          `${applied.testsGivenParameters} test(s) that had none`,
      );
    }

    // 4. Report anything still un-enterable so it shows up in the log rather
    //    than being discovered by a technician with a patient waiting.
    const stranded = await prisma().test.findMany({
      where: { isActive: true, parameters: { none: {} } },
      select: { name: true },
    });
    if (stranded.length > 0) {
      console.warn(
        `[reconcileTestCatalogue] ${stranded.length} active test(s) still have no parameters and cannot accept a result: ` +
          stranded.map(t => t.name).join(", "),
      );
    }
  } catch (err) {
    console.error("[reconcileTestCatalogue] failed:", err);
  }
}
