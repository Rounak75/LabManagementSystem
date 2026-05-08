import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession, requireAdmin } from "@main/session";
import { nextVisitId } from "@main/services/id-generator";
import { audit } from "@main/services/audit.service";
import type { VisitCreateInput } from "@shared/api";

register("visits:create", async (input: VisitCreateInput) => {
  const u = requireSession();
  if (!input.patientId || !input.testIds?.length) throw new Error("INVALID_INPUT");

  const visitId = await nextVisitId();

  const tests = await prisma().test.findMany({ where: { id: { in: input.testIds } } });
  const subtotal = tests.reduce((sum, t) => sum + Number(t.price), 0);

  // Build a map for quick isOutsourced lookups (server-side trust boundary).
  const testById = new Map(tests.map(t => [t.id, t]));
  // Optional per-test metadata from the client (e.g. outsourced sentTo / external ref).
  const metaByTestId = new Map(
    (input.tests ?? []).map(m => [m.testId, m])
  );

  const now = new Date();
  const visit = await prisma().visit.create({
    data: {
      visitId,
      patientId: input.patientId,
      type: input.type,
      visitDate: input.visitDate ? new Date(input.visitDate) : new Date(),
      status: "Open",
      staffId: u.id,
      visitTests: {
        create: input.testIds.map(testId => {
          const t = testById.get(testId);
          const meta = metaByTestId.get(testId);
          // Only persist outsourced metadata when the Test row says it is outsourced.
          // Never trust client-only flags.
          if (t?.isOutsourced) {
            return {
              testId,
              status: "Collected",
              sampleCollectedAt: now,
              outsourcedSentTo: meta?.outsourcedSentTo ?? null,
              outsourcedExternalRef: meta?.outsourcedExternalRef ?? null,
              outsourcedStatus: "Sent",
              outsourcedSentAt: now,
            };
          }
          return { testId, status: "Collected", sampleCollectedAt: now };
        })
      },
      invoice: { create: { subtotal, total: subtotal, paymentStatus: "Pending", amountPaid: 0 } }
    },
    include: { visitTests: true }
  });
  await audit("CREATE", "Visit", visit.id);

  // Audit OUTSOURCED_SENT for each VisitTest that was created with outsourced metadata.
  for (const vt of visit.visitTests ?? []) {
    if (vt.outsourcedStatus === "Sent") {
      await audit(
        "OUTSOURCED_SENT",
        "VisitTest",
        vt.id,
        JSON.stringify({ sentTo: vt.outsourcedSentTo })
      );
    }
  }

  return visit;
});

register("visits:get", async ({ id }: { id: string }) => {
  requireSession();
  const v = await prisma().visit.findUnique({
    where: { id },
    include: {
      patient: { include: { referredBy: true } },
      staff: true,
      visitTests: { include: { test: { include: { parameters: { orderBy: { displayOrder: "asc" } } } }, results: true, verifiedBy: true } },
      invoice: true
    }
  });
  if (!v) throw new Error("NOT_FOUND");
  return v;
});

register("visits:listForPatient", async ({ patientId }: { patientId: string }) => {
  requireSession();
  return prisma().visit.findMany({
    where: { patientId, deletedAt: null },
    orderBy: { visitDate: "desc" },
    include: { visitTests: { include: { test: true } }, invoice: true }
  });
});

register("visitTests:getOne", async ({ id }: { id: string }) => {
  requireSession();
  const vt = await prisma().visitTest.findUnique({
    where: { id },
    include: {
      test: { include: { parameters: { orderBy: { displayOrder: "asc" } } } },
      results: true,
      visit: { include: { patient: true } }
    }
  });
  if (!vt) throw new Error("NOT_FOUND");
  return vt;
});

register("visitTests:updateStatus", async ({ visitTestId, status }: { visitTestId: string; status: string }) => {
  requireSession();
  const vt = await prisma().visitTest.update({
    where: { id: visitTestId },
    data: { status, ...(status === "ResultEntered" ? { resultEnteredAt: new Date() } : {}) }
  });
  await audit("UPDATE_STATUS", "VisitTest", visitTestId);
  return vt;
});

register("visitTests:lock", async ({ visitTestId }: { visitTestId: string }) => {
  const u = requireAdmin();
  const vt = await prisma().visitTest.update({
    where: { id: visitTestId },
    data: { isLocked: true, status: "Verified", verifiedById: u.id, verifiedAt: new Date() }
  });
  await audit("VERIFY", "VisitTest", visitTestId);

  const allTests = await prisma().visitTest.findMany({ where: { visitId: vt.visitId } });
  if (allTests.every(t => t.status === "Verified")) {
    await prisma().visit.update({ where: { id: vt.visitId }, data: { status: "Completed" } });
    await prisma().visitTest.updateMany({ where: { visitId: vt.visitId }, data: { status: "Ready" } });
  }
  return vt;
});
