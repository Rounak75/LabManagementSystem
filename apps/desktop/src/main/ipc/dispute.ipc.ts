// Phase 3d Plan C — dispute resolution from the desktop.
// When a patient submits a "this isn't me" dispute on the portal, staff calls
// to verify, then either dismisses (it's fine) or dissociates the phone from
// the affected patient row.

import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin } from "@main/session";
import { audit } from "@main/services/audit.service";

register("patient:dissociatePhone", async ({
  patientId,
  disputeId,
}: { patientId: string; disputeId?: string }) => {
  const u = requireAdmin();
  await prisma().$transaction(async (tx) => {
    await tx.patient.update({ where: { id: patientId }, data: { phone: null } });
    if (disputeId) {
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: "Resolved",
          resolvedAt: new Date(),
          resolvedByUserId: u.id,
        },
      });
    }
  });
  await audit(
    "PHONE_DISSOCIATED",
    "Patient",
    patientId,
    disputeId ? JSON.stringify({ disputeId }) : undefined
  );
  return { ok: true };
});
