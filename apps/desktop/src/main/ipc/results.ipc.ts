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

register("results:upsert", async (input: ResultUpsertInput) => {
  const u = requireSession();
  const vt = await prisma().visitTest.findUnique({
    where: { id: input.visitTestId },
    include: { test: { include: { parameters: true } }, visit: { include: { patient: true } } }
  });
  if (!vt) throw new Error("NOT_FOUND");
  if (vt.isLocked) throw new Error("FORBIDDEN");
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
    });
    await prisma().testResult.upsert({
      where: { visitTestId_parameterId: { visitTestId: input.visitTestId, parameterId: v.parameterId } },
      create: { visitTestId: input.visitTestId, parameterId: v.parameterId, value: v.value, isAbnormal: abnormal, enteredById: u.id },
      update: { value: v.value, isAbnormal: abnormal, enteredById: u.id }
    });
  }

  const fresh = await prisma().testResult.findMany({ where: { visitTestId: input.visitTestId } });
  const allFilled = vt.test.parameters.every(p => fresh.some(r => r.parameterId === p.id && r.value.trim() !== ""));
  if (allFilled) {
    await prisma().visitTest.update({ where: { id: input.visitTestId }, data: { status: "ResultEntered", resultEnteredAt: new Date() } });
  }
  await audit("UPSERT_RESULTS", "VisitTest", input.visitTestId);
  return { ok: true };
});
