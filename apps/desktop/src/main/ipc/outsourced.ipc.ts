import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";

register("outsourced:list", async () => {
  requireSession();
  return prisma().visitTest.findMany({
    where: { outsourcedStatus: "Sent" },
    include: {
      visit: {
        select: {
          id: true,
          visitId: true,
          patient: { select: { id: true, patientId: true, name: true, age: true, sex: true } },
        },
      },
      test: { select: { id: true, name: true } },
    },
    orderBy: { outsourcedSentAt: "asc" },
  });
});

register("outsourced:markReceived", async (p: { visitTestId: string }) => {
  requireSession();
  const vt = await prisma().visitTest.findUnique({ where: { id: p.visitTestId } });
  if (!vt) throw new Error("NOT_FOUND");
  if (vt.outsourcedStatus !== "Sent") throw new Error("INVALID_STATE");
  await prisma().visitTest.update({
    where: { id: p.visitTestId },
    data: { outsourcedStatus: "Received", outsourcedReceivedAt: new Date() },
  });
  await audit("OUTSOURCED_RECEIVED", "VisitTest", p.visitTestId);
  return { ok: true };
});
