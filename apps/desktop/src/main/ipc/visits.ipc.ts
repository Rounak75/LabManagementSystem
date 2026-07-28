import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession, requireAdmin } from "@main/session";
import { audit } from "@main/services/audit.service";
import { audit as auditBestEffort } from "@main/services/audit-best-effort";
import * as triggers from "@main/services/notifications/triggers";
import type { VisitCreateInput } from "@shared/api";
import { generateAndHash } from "@main/services/access-code.service";
import { visitOrchestrator } from "@main/domain/visit-orchestrator";
import "@main/domain/side-effects"; // Register domain event listeners

register("visits:create", async (input: VisitCreateInput) => {
  const u = requireSession();
  return await visitOrchestrator.createVisit({ ...input, staffId: u.id });
});

/**
 * Phase 3d Plan A — regenerate a visit's portal access code.
 * Admin-only; audited. Used when a patient loses their receipt.
 */
register("visits:regenerateAccessCode", async ({ visitId }: { visitId: string }) => {
  const u = requireAdmin();
  const visit = await prisma().visit.findUnique({ where: { id: visitId } });
  if (!visit) throw new Error("VISIT_NOT_FOUND");
  const { plaintext, hash } = await generateAndHash();
  await prisma().visit.update({
    where: { id: visitId },
    data: { accessCodeHash: hash, accessCodePlaintext: plaintext }
  });
  await auditBestEffort.try("RESULT_UNLOCKED", {
    entityType: "Visit",
    entityId: visitId,
    userId: u.id,
    details: `Admin user ${u.id} regenerated access code for visit`
  });
  return { accessCode: plaintext };
});

/**
 * Hand a verified report to the patient even though the bill is unpaid — or take
 * that permission back.
 *
 * The portal withholds a verified report while a balance remains. That is right
 * for a walk-in and wrong for a regular the lab has always extended credit to, or
 * a patient who paid in a way the system has not caught up with. Without this the
 * only options would be to record a payment that never happened, which corrupts
 * the day's takings, or to tell the patient their report does not exist.
 *
 * Admin-only and audited: it is a decision about money someone may have to answer
 * for later. The flag reaches the portal through the ordinary outbox sync, so no
 * extra push is needed here.
 *
 * This does not touch printing. The owner is standing in the lab and knows the
 * patient; blocking a legitimate handover is worse than the money risk the gate
 * exists to manage.
 */
export async function setReportReleaseOverride({
  visitId,
  release,
  reason,
}: {
  visitId: string;
  release: boolean;
  reason?: string;
}): Promise<{ released: boolean }> {
  const u = requireAdmin();
  const visit = await prisma().visit.findUnique({ where: { id: visitId } });
  if (!visit) throw new Error("NOT_FOUND");

  await prisma().visit.update({
    where: { id: visitId },
    data: {
      reportReleaseOverride: release,
      // Clearing the trail alongside the flag keeps a stale "released by X on Y"
      // from sitting against a visit that is being withheld again.
      reportReleaseOverrideByUserId: release ? u.id : null,
      reportReleaseOverrideAt: release ? new Date() : null,
      reportReleaseOverrideReason: release ? (reason?.slice(0, 500) ?? null) : null,
    },
  });

  await auditBestEffort.try(
    release ? "REPORT_RELEASE_OVERRIDDEN" : "REPORT_RELEASE_OVERRIDE_REVOKED",
    {
      entityType: "Visit",
      entityId: visitId,
      userId: u.id,
      details: { reason: reason ?? null },
    },
  );

  return { released: release };
}

register("visits:setReportReleaseOverride", setReportReleaseOverride);

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

  // Task 10: `wasPreviouslyVerified` lets ResultEntry show an "audit-on-edit"
  // banner after Admin unlocks a verified result. True when the most recent
  // RESULT_UNLOCKED audit row is newer than the current verifiedAt (or the
  // result has been unlocked back to non-verified state — verifiedAt is null).
  const lastUnlock = await prisma().auditLog.findFirst({
    where: { action: "RESULT_UNLOCKED", targetEntity: "VisitTest", targetId: vt.id },
    orderBy: { timestamp: "desc" }
  });
  const wasPreviouslyVerified =
    !!lastUnlock && (!vt.verifiedAt || lastUnlock.timestamp > vt.verifiedAt);

  return { ...vt, wasPreviouslyVerified };
});

register("visitTests:updateStatus", async ({ visitTestId, status, outsourcedSentTo }: { visitTestId: string; status: string; outsourcedSentTo?: string }) => {
  requireSession();
  const sentTo = outsourcedSentTo?.trim();
  const vt = await prisma().visitTest.update({
    where: { id: visitTestId },
    data: {
      status,
      ...(status === "ResultEntered" ? { resultEnteredAt: new Date() } : {}),
      ...(status === "Outsourced" ? { outsourcedSentAt: new Date(), ...(sentTo ? { outsourcedSentTo: sentTo } : {}) } : {})
    }
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
    // Visit.status → "Completed" is handled here (existing logic — do NOT repeat in trigger).
    await prisma().visit.update({ where: { id: vt.visitId }, data: { status: "Completed" } });
    await prisma().visitTest.updateMany({ where: { visitId: vt.visitId }, data: { status: "Ready" } });
  }

  // Count remaining unlocked tests; if all are locked fire the reportReady notification.
  const remaining = await prisma().visitTest.count({
    where: { visitId: vt.visitId, isLocked: false },
  });
  let notificationIds: string[] = [];
  if (remaining === 0) {
    try {
      notificationIds = await triggers.reportReady(vt.visitId);
    } catch (err) {
      console.error("[notifications] reportReady trigger failed", err);
    }
  }

  return { ...vt, notificationIds };
});

/**
 * Task 10 — Admin "Unlock to edit" for a verified-locked VisitTest.
 *
 * Exported (not just registered) so tests can call it directly without
 * routing through Electron IPC. The role check runs BEFORE the reason
 * check on purpose (consistent with other handlers that authenticate
 * before validating input).
 *
 * The reason length is checked against `.trim().length` so all-whitespace
 * is rejected. INVOICE_PAID_BEFORE_UNLOCK fires when the visit's invoice
 * has already been paid — the caller must cancel/refund the invoice first.
 *
 * On success: clears isLocked + verifiedAt, drops status back to
 * "ResultEntered" (so the row appears again in the entry/verify queues),
 * and writes a best-effort RESULT_UNLOCKED audit row.
 */
export async function unlockVisitTest(
  input: { visitTestId: string; reason: string }
): Promise<{ isLocked: false }> {
  const session = requireSession();
  if (session.role !== "Admin") throw new Error("FORBIDDEN");
  if (input.reason.trim().length < 10) throw new Error("REASON_REQUIRED");

  const vt = await prisma().visitTest.findUnique({
    where: { id: input.visitTestId },
    include: { visit: { include: { invoice: true } } }
  });
  if (!vt) throw new Error("NOT_FOUND");
  if (vt.visit.invoice?.paymentStatus === "Paid") {
    throw new Error("INVOICE_PAID_BEFORE_UNLOCK");
  }

  const previouslyVerifiedAt = vt.verifiedAt;
  await prisma().visitTest.update({
    where: { id: vt.id },
    data: { isLocked: false, status: "ResultEntered", verifiedAt: null }
  });

  await auditBestEffort.try("RESULT_UNLOCKED", {
    entityType: "VisitTest",
    entityId: vt.id,
    userId: session.id,
    details: { reason: input.reason, previouslyVerifiedAt }
  });

  return { isLocked: false };
}

register("visitTests:unlock", unlockVisitTest);
