// Phase 3d Plan F — bookings inbox IPC.
// Reads from the Booking staging table populated by the portal.
// Approval/decline orchestration lives in bookings.service.ts so the multi-row
// write happens inside a single Prisma transaction.

import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin } from "@main/session";
import { audit } from "@main/services/audit.service";
import * as triggers from "@main/services/notifications/triggers";
import {
  approveBooking,
  declineBooking,
  type ApproveResult,
} from "@main/services/bookings.service";

register("bookings:list", async ({ status }: { status?: string } = {}) => {
  requireAdmin();
  return prisma().booking.findMany({
    where: status && status !== "All" ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
});

register("bookings:approve", async ({
  bookingId,
  assignedToUserId,
  chosenPatientId,
  expectedVersion,
}: {
  bookingId: string;
  assignedToUserId?: string | null;
  chosenPatientId?: string | null;
  expectedVersion?: number;
}): Promise<ApproveResult> => {
  const u = requireAdmin();
  const result = await approveBooking({
    bookingId,
    staffUserId: u.id,
    assignedToUserId: assignedToUserId ?? null,
    chosenPatientId: chosenPatientId ?? null,
    expectedVersion,
  });

  if (result.kind === "approved") {
    await audit("BOOKING_APPROVED", "Booking", bookingId);
    // Fire-and-forget patient confirmation email.
    triggers.visitBooked(result.visitId).catch((e) =>
      console.error("[notifications] visitBooked (booking approve) failed", e),
    );
    triggers.bookingApproved(bookingId).catch((e) =>
      console.error("[notifications] bookingApproved failed", e),
    );
  }
  return result;
});

register("bookings:decline", async ({
  bookingId,
  reason,
  expectedVersion,
}: { bookingId: string; reason: string; expectedVersion?: number }) => {
  requireAdmin();
  await declineBooking({ bookingId, reason, expectedVersion });
  await audit("BOOKING_DECLINED", "Booking", bookingId);
  triggers.bookingDeclined(bookingId).catch((e) =>
    console.error("[notifications] bookingDeclined failed", e),
  );
  return { ok: true };
});

register("bookings:assign", async ({
  bookingId,
  assignedToUserId,
}: { bookingId: string; assignedToUserId: string }) => {
  requireAdmin();
  return prisma().booking.update({
    where: { id: bookingId },
    data: { assignedToUserId, version: { increment: 1 } },
  });
});

register("bookings:listPhlebotomists", async () => {
  requireAdmin();
  return prisma().user.findMany({
    where: { canCollectSamples: true, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
});
