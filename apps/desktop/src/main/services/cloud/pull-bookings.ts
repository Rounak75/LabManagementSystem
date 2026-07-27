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
import * as triggers from "@main/services/notifications/triggers";

const SOURCE = "bookings";
const BATCH = 100;

interface RawBookingRow {
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
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  let rows: RawBookingRow[] = [];
  try {
    rows = (await client.pullSince("bookings", "updated_at", sinceIso, BATCH, undefined, lastId)) as unknown as RawBookingRow[];
  } catch (e) {
    logger.error("cloud", "[pull-bookings] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;
  for (const r of rows) {
    try {
      const existing = await prisma().booking.findUnique({ where: { id: r.id } });
      if (existing && existing.version > (r.version ?? 0)) {
        // Local already has a newer copy (staff approved / declined).
        // Don't overwrite — desktop is the source of truth post-approval.
        latest = new Date(r.updated_at);
        latestId = r.id;
        continue;
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
      if (!existing && r.status === "Pending") {
        triggers.bookingCreatedStaff(r.id).catch((e) =>
          logger.error("cloud", "[pull-bookings] bookingCreatedStaff trigger failed", e),
        );
      }

      // Success -> advance cursor
      latest = new Date(r.updated_at);
      latestId = r.id;
    } catch (e: any) {
      if (e?.code === "P2002" || e?.code === "P2003") {
        logger.warn("cloud", "[pull-bookings] skipping row" + " " + r.booking_id + " " + "— constraint conflict:" + " " + JSON.stringify(e.meta));
        // Skipped constraint conflict -> advance cursor
        latest = new Date(r.updated_at);
        latestId = r.id;
        continue;
      }
      logger.error("cloud", "[pull-bookings] row" + " " + r.booking_id + " " + "failed", e);
      throw e;
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest, lastId: latestId },
    create: { source: SOURCE, lastSyncedAt: latest, lastId: latestId },
  });
}
