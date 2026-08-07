import { prisma } from "@main/db";
import { nextVisitId } from "@main/services/id-generator";
import { domainEvents } from "./events";
import type { VisitCreateInput } from "@shared/api";

export class VisitOrchestrator {
  async createVisit(input: VisitCreateInput & { staffId: string }) {
    if (!input.patientId || !input.testIds?.length) throw new Error("INVALID_INPUT");

    const visitId = await nextVisitId();
    const tests = await prisma().test.findMany({ where: { id: { in: input.testIds } } });
    const subtotal = tests.reduce((sum, t) => sum + Number(t.price), 0);

    const testById = new Map(tests.map(t => [t.id, t]));
    const metaByTestId = new Map((input.tests ?? []).map(m => [m.testId, m]));

    const now = new Date();

    const visit = await prisma().visit.create({
      data: {
        visitId,
        patientId: input.patientId,
        type: input.type,
        visitDate: input.visitDate ? new Date(input.visitDate) : new Date(),
        status: "Open",
        staffId: input.staffId,
        visitTests: {
          create: input.testIds.map(testId => {
            const t = testById.get(testId);
            const meta = metaByTestId.get(testId);
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

    // Fire Domain Events
    await domainEvents.emit("VisitCreated", { visit });

    for (const vt of visit.visitTests ?? []) {
      if (vt.outsourcedStatus === "Sent") {
        await domainEvents.emit("OutsourcedTestSent", { visitTest: vt });
      }
    }

    return visit;
  }
}

export const visitOrchestrator = new VisitOrchestrator();
