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
  listUnconvertedApprovals,
  resolveApprovedBooking,
  type ApproveResult,
  type PhoneConfirmOutcome,
  type ResolveApprovedResult,
} from "@main/services/bookings.service";
import { domainError } from "@shared/domain-error";

register("bookings:list", async ({ status }: { status?: string } = {}) => {
  requireAdmin();
  return prisma().booking.findMany({
    where: status && status !== "All" ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
});

// Asked for on every visit to the Bookings screen, whatever status filter is
// selected. A booking approved on a phone whose conversion failed is Approved,
// so it never shows under the Pending filter the screen opens on — the one
// place the owner would look.
register("bookings:listUnconverted", async () => {
  requireAdmin();
  return listUnconvertedApprovals();
});

// Finishes an approval the portal made that the sweep will not complete on its
// own — a shared phone it refuses to guess about. Without this the booking is
// stuck for good: it is no longer Pending, so bookings:approve rejects it.
register("bookings:resolveApproved", async ({
  bookingId,
  chosenPatientId,
}: {
  bookingId: string;
  chosenPatientId?: string | null;
}): Promise<ResolveApprovedResult> => {
  const u = requireAdmin();
  const result = await resolveApprovedBooking({
    bookingId,
    staffUserId: u.id,
    chosenPatientId: chosenPatientId ?? null,
  });

  if (result.kind === "converted") {
    await audit("BOOKING_RESOLVED", "Booking", bookingId);
    // The patient was told their collection was confirmed when the portal
    // approved it, but no visit existed to tell them about until now.
    triggers.visitBooked(result.visitId).catch((e) =>
      console.error("[notifications] visitBooked (booking resolve) failed", e),
    );
  }
  return result;
});

register("bookings:approve", async ({
  bookingId,
  assignedToUserId,
  chosenPatientId,
  phoneConfirmOutcome,
  expectedVersion,
}: {
  bookingId: string;
  assignedToUserId?: string | null;
  chosenPatientId?: string | null;
  phoneConfirmOutcome?: PhoneConfirmOutcome;
  expectedVersion?: number;
}): Promise<ApproveResult> => {
  const u = requireAdmin();
  // Validated here as well as in the dialog: the renderer is not the only thing
  // that can reach this channel, and a booking approved without the call
  // recorded is indistinguishable afterwards from one that was checked.
  if (phoneConfirmOutcome !== "Reached" && phoneConfirmOutcome !== "NoAnswer") {
    throw domainError("PHONE_CONFIRM_REQUIRED");
  }
  const result = await approveBooking({
    bookingId,
    staffUserId: u.id,
    assignedToUserId: assignedToUserId ?? null,
    chosenPatientId: chosenPatientId ?? null,
    phoneConfirmOutcome,
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
