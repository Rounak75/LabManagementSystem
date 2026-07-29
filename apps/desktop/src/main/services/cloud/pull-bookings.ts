import { logger } from "./logger";
// Phase 3d Plan F — pull portal-created bookings into local SQLite.
// Mirrors the pullPaymentEvents pattern: a SyncCursor row tracks the last
// updated_at we ingested. The desktop is source of truth post-approval; if a
// local copy has a higher version (e.g. staff already approved), incoming
// cloud rows are skipped so we don't clobber the conversion.
//
// Side effect: when a new "Pending" booking arrives, fires the
// BookingCreatedStaff notification trigger so the lab Gmail inbox lights up.

import { prisma } from "@main/db";
import type { CloudClient } from "./sync-engine";
import { runPull } from "./pull-runner";
import * as triggers from "@main/services/notifications/triggers";
import { convertPendingApprovedBookings } from "@main/services/bookings.service";

const SOURCE = "bookings";
const BATCH = 100;

interface RawBookingRow extends Record<string, unknown> {
  id: string;
  booking_id: string;
  patient_phone: string;
  patient_name: string;
  patient_email: string | null;
  address: string;
  pincode: string | null;
  test_ids: string;
  preferred_date: string;
  preferred_slot: string;
  notes: string | null;
  status: string;
  decline_reason: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  assigned_to_user_id: string | null;
  resulting_visit_id: string | null;
  resulting_patient_id: string | null;
  version: number;
  source_ip: string | null;
  captcha_passed: boolean;
  created_at: string;
  updated_at: string;
}

export async function pullBookings(client: CloudClient): Promise<void> {
  // Driven by the shared runner rather than its own loop. The hand-rolled
  // version rethrew any error that was not a constraint conflict, which skipped
  // the cursor write — so the next tick re-fetched the same page, hit the same
  // row and threw again, every few seconds forever. One malformed booking stopped
  // every later booking from ever reaching the lab PC, with nothing in the UI to
  // say so. The runner retries a failing row a bounded number of times and then
  // quarantines it in SyncDeadLetter, where it is visible and the stream moves on.
  await runPull<RawBookingRow>(client, {
    source: SOURCE,
    table: "bookings",
    cursorColumn: "updated_at",
    batchSize: BATCH,

    applyRow: async (r) => {
      const existing = await prisma().booking.findUnique({ where: { id: r.id } });
      if (existing && existing.version > (r.version ?? 0)) {
        // Local already has a newer copy (staff approved / declined here).
        // Genuinely nothing to do, so returning is correct: the desktop is the
        // source of truth post-approval.
        return;
      }

      const data = {
        id: r.id,
        bookingId: r.booking_id,
        patientPhone: r.patient_phone,
        patientName: r.patient_name,
        patientEmail: r.patient_email ?? null,
        address: r.address,
        pincode: r.pincode ?? null,
        testIds: r.test_ids,
        preferredDate: new Date(r.preferred_date),
        preferredSlot: r.preferred_slot,
        notes: r.notes ?? null,
        status: r.status,
        declineReason: r.decline_reason ?? null,
        approvedByUserId: r.approved_by_user_id ?? null,
        approvedAt: r.approved_at ? new Date(r.approved_at) : null,
        assignedToUserId: r.assigned_to_user_id ?? null,
        resultingVisitId: r.resulting_visit_id ?? null,
        resultingPatientId: r.resulting_patient_id ?? null,
        version: r.version ?? 0,
        sourceIp: r.source_ip ?? null,
        captchaPassed: !!r.captcha_passed,
        createdAt: new Date(r.created_at),
      };

      await prisma().booking.upsert({
        where: { id: r.id },
        create: data,
        update: data,
      });

      // First time we see this booking, and it's still Pending: notify staff.
      // Best-effort — a mail failure must not hold up the booking itself.
      if (!existing && r.status === "Pending") {
        triggers.bookingCreatedStaff(r.id).catch((e) =>
          logger.error("cloud", "[pull-bookings] bookingCreatedStaff trigger failed", e),
        );
      }

      // Declining in the staff portal only set the status. The email telling the
      // patient — the one the lab's own guide promises them — was sent by the
      // desktop's Decline button and nowhere else, so a decline made on a phone
      // left the patient waiting for a collection that was never coming.
      if (existing?.status !== "Declined" && r.status === "Declined") {
        triggers.bookingDeclined(r.id).catch((e) =>
          logger.error("cloud", "[pull-bookings] bookingDeclined trigger failed", e),
        );
      }
    },
  });

  // Approving in the staff portal only marks the booking Approved and assigns a
  // phlebotomist. Everything that makes the approval mean anything — the
  // Patient, the Visit, its tests, the Invoice, the HomeVisit — lived behind the
  // desktop's own Approve button and ran nowhere else, so a home collection
  // approved from a phone produced no visit to collect against and no bill,
  // while the patient was told their booking was accepted.
  //
  // Swept rather than done per arriving row: a conversion that fails has to be
  // retried, and by then the cursor has moved past the approval.
  try {
    const swept = await convertPendingApprovedBookings();
    if (swept.converted || swept.failed) {
      logger.info("cloud", "[pull-bookings] converted approvals", {
        converted: swept.converted,
        skipped: swept.skipped,
        failed: swept.failed,
      });
    }

    // Tell the patient their home visit is confirmed. These two fired only from
    // the desktop's own Approve button, so an approval made on a phone produced
    // a visit nobody had told the patient about.
    for (const { bookingId, visitId } of swept.convertedItems) {
      triggers.bookingApproved(bookingId).catch((e) =>
        logger.error("cloud", "[pull-bookings] bookingApproved trigger failed", e),
      );
      triggers.visitBooked(visitId).catch((e) =>
        logger.error("cloud", "[pull-bookings] visitBooked trigger failed", e),
      );
    }
  } catch (e) {
    logger.error("cloud", "[pull-bookings] approval sweep failed", e);
  }
}
