import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession } from "@main/session";
import { isAbnormal } from "@main/services/abnormality";
import { audit } from "@main/services/audit.service";
import type { ResultUpsertInput } from "@shared/api";

register("results:listForVisit", async ({ visitId }: { visitId: string }) => {
  requireSession();
  return prisma().visitTest.findMany({
    where: { visitId },
    include: {
      test: { include: { parameters: { orderBy: { displayOrder: "asc" } } } },
      results: true,
      visit: { include: { patient: true } }
    }
  });
});

/**
 * Upsert results for all parameters of a single VisitTest.
 *
 * Optimistic concurrency: callers may pass `expectedVersion` — the highest
 * `version` they saw on any existing TestResult row for this visitTest when
 * they loaded the page. If any current row's version exceeds that value,
 * the save is rejected with `STALE_VERSION` so the renderer can prompt the
 * user to reload. On success every row's `version` is incremented by 1, and
 * brand-new rows start at the schema default (1).
 *
 * Exported (rather than living inline in the IPC handler) so the version
 * check can be unit-tested without spinning up Electron's ipcMain.
 */
export async function upsertResults(input: ResultUpsertInput) {
  const u = requireSession();
  const vt = await prisma().visitTest.findUnique({
    where: { id: input.visitTestId },
    include: { test: { include: { parameters: true } }, visit: { include: { patient: true } } }
  });
  if (!vt) throw new Error("NOT_FOUND");
  if (vt.isLocked) throw new Error("FORBIDDEN");

  // Optimistic concurrency check. We compare against the highest version
  // among existing rows for this visitTest. findFirst with orderBy is enough
  // — all rows in a visitTest are bumped together, so they share a version.
  if (input.expectedVersion !== undefined) {
    const current = await prisma().testResult.findFirst({
      where: { visitTestId: input.visitTestId },
      orderBy: { version: "desc" }
    });
    if (current && current.version !== input.expectedVersion) {
      throw new Error("STALE_VERSION");
    }
  }

  const settings = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  const childAge = settings?.childAgeBoundary ?? 12;

  const paramMap = new Map(vt.test.parameters.map(p => [p.id, p]));

  for (const v of input.values) {
    const param = paramMap.get(v.parameterId);
    if (!param) continue;
    const abnormal = isAbnormal({
      resultType: param.resultType as any,
      value: v.value,
      patientSex: vt.visit.patient.sex as any,
      patientAge: vt.visit.patient.age,
      childAgeBoundary: childAge,
      refRangeMaleMin:    param.refRangeMaleMin    !== null ? Number(param.refRangeMaleMin)    : null,
      refRangeMaleMax:    param.refRangeMaleMax    !== null ? Number(param.refRangeMaleMax)    : null,
      refRangeFemaleMin:  param.refRangeFemaleMin  !== null ? Number(param.refRangeFemaleMin)  : null,
      refRangeFemaleMax:  param.refRangeFemaleMax  !== null ? Number(param.refRangeFemaleMax)  : null,
      refRangeChildMin:   param.refRangeChildMin   !== null ? Number(param.refRangeChildMin)   : null,
      refRangeChildMax:   param.refRangeChildMax   !== null ? Number(param.refRangeChildMax)   : null,
      qualitativeOptions: param.qualitativeOptions, normalQualitative: param.normalQualitative
    }, v.abnormalOverride);
    await prisma().testResult.upsert({
      where: { visitTestId_parameterId: { visitTestId: input.visitTestId, parameterId: v.parameterId } },
      create: {
        visitTestId: input.visitTestId,
        parameterId: v.parameterId,
        value: v.value,
        isAbnormal: abnormal,
        abnormalOverride: v.abnormalOverride ?? null,
        notes: v.notes ?? null,
        enteredById: u.id
      },
      update: {
        value: v.value,
        isAbnormal: abnormal,
        abnormalOverride: v.abnormalOverride ?? null,
        notes: v.notes ?? null,
        enteredById: u.id,
        version: { increment: 1 }
      }
    });
  }

  const fresh = await prisma().testResult.findMany({ where: { visitTestId: input.visitTestId } });
  const allFilled = vt.test.parameters.every(p => fresh.some(r => r.parameterId === p.id && r.value.trim() !== ""));
  if (allFilled) {
    await prisma().visitTest.update({ where: { id: input.visitTestId }, data: { status: "ResultEntered", resultEnteredAt: new Date() } });
  }
  await audit("UPSERT_RESULTS", "VisitTest", input.visitTestId);
  // Surface the new version so the renderer can echo it back as
  // `expectedVersion` on the next save.
  const newest = await prisma().testResult.findFirst({
    where: { visitTestId: input.visitTestId },
    orderBy: { version: "desc" }
  });
  return { ok: true, version: newest?.version ?? 1 };
}

register("results:upsert", (input: ResultUpsertInput) => upsertResults(input));
