// Phase 3d Plan F — bookings service.
// Approving a booking is an atomic conversion: Booking + Patient + Visit +
// HomeVisit + Invoice all written in a single Prisma transaction. If anything
// throws, the booking stays Pending and nothing leaks.
//
// Patient resolution rules:
//   0 matches by phone → create a new Patient (createdNewPatient: true).
//   1 match            → reuse it.
//   ≥2 matches         → return { kind: "chooser" } so the staff can decide
//                        whether this booking belongs to an existing family
//                        member or to a brand-new "extra" patient on the line.
//
// Optimistic concurrency: callers may pass `expectedVersion`; if the booking's
// `version` no longer matches, the transaction throws STALE_VERSION.

import { prisma } from "@main/db";
import { nextPatientId, nextVisitId } from "./id-generator";
import { generateAndHash } from "./access-code.service";

export interface PatientChoice {
  id: string;
  patientId: string;
  name: string;
  age: number;
  sex: string;
}

export interface ApproveInput {
  bookingId: string;
  staffUserId: string;
  assignedToUserId: string | null;
  /** When the chooser surfaced previously, the staff's selection. "__new__"
   *  means create a fresh patient even though phone matches existed. */
  chosenPatientId?: string | null;
  expectedVersion?: number;
}

export type ApproveResult =
  | {
      kind: "approved";
      visitId: string;
      patientId: string;
      accessCode: string;
      createdNewPatient: boolean;
    }
  | { kind: "chooser"; candidates: PatientChoice[] };

export interface DeclineInput {
  bookingId: string;
  reason: string;
  expectedVersion?: number;
}

export async function listPatientCandidatesByPhone(phone: string): Promise<PatientChoice[]> {
  const rows = await prisma().patient.findMany({
    where: { phone, deletedAt: null },
    select: { id: true, patientId: true, name: true, age: true, sex: true },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

export async function approveBooking(input: ApproveInput): Promise<ApproveResult> {
  // Phase 1: read-only look at the booking + patient candidates outside the
  // transaction so we can short-circuit with a chooser response without
  // opening (and then rolling back) a write txn.
  const booking = await prisma().booking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new Error("NOT_FOUND");
  if (booking.status !== "Pending") throw new Error("INVALID_STATE");
  if (input.expectedVersion !== undefined && booking.version !== input.expectedVersion) {
    throw new Error("STALE_VERSION");
  }

  const candidates = await listPatientCandidatesByPhone(booking.patientPhone);
  const wantsNew = input.chosenPatientId === "__new__";

  // Decide which patient this booking is for.
  let targetPatientId: string | null = null;
  let createdNewPatient = false;

  if (input.chosenPatientId && input.chosenPatientId !== "__new__") {
    // Caller explicitly chose an existing patient. Validate they're still a candidate.
    const ok = candidates.some((c) => c.id === input.chosenPatientId);
    if (!ok) throw new Error("INVALID_INPUT");
    targetPatientId = input.chosenPatientId;
  } else if (candidates.length === 0 || wantsNew) {
    targetPatientId = null; // we'll create one inside the txn
    createdNewPatient = true;
  } else if (candidates.length === 1) {
    targetPatientId = candidates[0]!.id;
  } else {
    // Multiple matches and no choice provided — surface the chooser.
    return { kind: "chooser", candidates };
  }

  const result = await writeConversion({
    booking,
    staffUserId: input.staffUserId,
    assignedToUserId: input.assignedToUserId,
    targetPatientId,
    expectedVersion: input.expectedVersion,
    requireStatus: "Pending",
  });

  return {
    kind: "approved",
    visitId: result.visitId,
    patientId: result.patientId,
    accessCode: result.accessCode,
    createdNewPatient,
  };
}

/** The booking row as this service reads it. */
type BookingRow = Awaited<ReturnType<typeof loadBooking>>;
async function loadBooking(id: string) {
  const b = await prisma().booking.findUnique({ where: { id } });
  if (!b) throw new Error("NOT_FOUND");
  return b;
}

/**
 * The atomic half of approving a booking: create or reuse the Patient, then the
 * Visit with its tests and invoice, the HomeVisit, and point the booking at what
 * it produced — all or nothing.
 *
 * Shared by the desktop's own Approve button and by the conversion of a booking
 * approved in the staff portal. The two differ only in the state they expect to
 * find; the writes must stay identical, because a home visit created down one
 * path and not the other is the kind of difference nobody notices until a
 * patient's bill is missing.
 */
async function writeConversion(opts: {
  booking: BookingRow;
  staffUserId: string;
  assignedToUserId: string | null;
  targetPatientId: string | null;
  expectedVersion?: number;
  requireStatus: "Pending" | "Approved";
}): Promise<{ visitId: string; patientId: string; accessCode: string }> {
  const { booking, targetPatientId } = opts;

  const { plaintext: accessCode, hash: accessCodeHash } = await generateAndHash();
  const visitDisplayId = await nextVisitId();
  const newPatientDisplayId = targetPatientId ? null : await nextPatientId();
  const testIds: string[] = safeParseTestIds(booking.testIds);

  const result = await prisma().$transaction(async (tx) => {
    // Re-check inside the txn to defend against a parallel approval/decline that
    // flipped the status between read and write.
    const fresh = await tx.booking.findUnique({ where: { id: booking.id } });
    if (!fresh) throw new Error("NOT_FOUND");
    if (fresh.status !== opts.requireStatus) throw new Error("INVALID_STATE");
    // Converting a booking that already produced a visit would give one request
    // two visits, two invoices and two bills.
    if (fresh.resultingVisitId) throw new Error("ALREADY_CONVERTED");
    if (opts.expectedVersion !== undefined && fresh.version !== opts.expectedVersion) {
      throw new Error("STALE_VERSION");
    }

    let patientId: string;
    if (targetPatientId) {
      patientId = targetPatientId;
    } else {
      const created = await tx.patient.create({
        data: {
          patientId: newPatientDisplayId!,
          name: booking.patientName,
          age: 0,
          sex: "Other",
          phone: booking.patientPhone,
          email: booking.patientEmail ?? null,
          address: booking.address,
          referredById: "doctor-self",
          createdById: opts.staffUserId,
        },
      });
      patientId = created.id;
    }

    const tests = testIds.length === 0
      ? []
      : await tx.test.findMany({ where: { id: { in: testIds } } });
    const subtotal = tests.reduce((s, t) => s + Number(t.price), 0);

    const visit = await tx.visit.create({
      data: {
        visitId: visitDisplayId,
        patientId,
        type: "HomeCollection",
        visitDate: booking.preferredDate,
        status: "Open",
        staffId: opts.staffUserId,
        accessCodeHash,
        accessCodePlaintext: accessCode,
        visitTests: { create: testIds.map((id) => ({ testId: id, status: "Pending" })) },
        invoice: { create: { subtotal, total: subtotal, paymentStatus: "Pending", amountPaid: 0 } },
      },
    });

    await tx.homeVisit.create({
      data: {
        patientId,
        bookerName: booking.patientName,
        bookerPhone: booking.patientPhone,
        address: booking.address,
        preferredDate: booking.preferredDate,
        preferredTime: booking.preferredSlot,
        testsRequested: booking.testIds,
        assignedToId: opts.assignedToUserId ?? null,
        status: "Booked",
        visitId: visit.id,
      },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "Approved",
        approvedByUserId: booking.approvedByUserId ?? opts.staffUserId,
        approvedAt: booking.approvedAt ?? new Date(),
        assignedToUserId: opts.assignedToUserId ?? null,
        resultingVisitId: visit.id,
        resultingPatientId: patientId,
        version: { increment: 1 },
      },
    });

    return { visitId: visit.id, patientId };
  });

  return { ...result, accessCode };
}

/** Why a synced booking could not be turned into a visit without a human. */
export type ConversionSkip = "not_approved" | "already_converted" | "ambiguous_patient";

export type ConvertResult =
  | { kind: "converted"; visitId: string; patientId: string; accessCode: string }
  | { kind: "skipped"; reason: ConversionSkip };

/**
 * Turns a booking approved in the staff portal into a real visit.
 *
 * Approving in the portal only marked the booking Approved and assigned a
 * phlebotomist; everything that makes the approval mean something — the Patient,
 * the Visit, its tests, the Invoice, the HomeVisit — lived behind the desktop's
 * own Approve button and ran nowhere else. So a home collection approved from a
 * phone produced no visit to collect against and no bill, and the patient was
 * told their booking was accepted.
 *
 * Called from the bookings pull once the approval reaches this machine, in the
 * same spirit as pull-verifications: the portal records the decision, the
 * desktop does the work, and both end in the same state.
 */
export async function convertApprovedBooking(bookingId: string): Promise<ConvertResult> {
  const booking = await loadBooking(bookingId);

  if (booking.status !== "Approved") return { kind: "skipped", reason: "not_approved" };
  if (booking.resultingVisitId) return { kind: "skipped", reason: "already_converted" };

  const candidates = await listPatientCandidatesByPhone(booking.patientPhone);

  // Households share a phone number. Which member a booking belongs to is a
  // judgement the staff make at the desktop's chooser; guessing here would file
  // one person's results under another's record. Left for a human instead.
  if (candidates.length > 1) return { kind: "skipped", reason: "ambiguous_patient" };

  const result = await writeConversion({
    booking,
    // The portal recorded who approved it; fall back only if that is missing.
    staffUserId: booking.approvedByUserId ?? "system",
    assignedToUserId: booking.assignedToUserId ?? null,
    targetPatientId: candidates[0]?.id ?? null,
    requireStatus: "Approved",
  });

  return { kind: "converted", ...result };
}

/** How many approvals one sweep will convert, so a backlog cannot stall a tick. */
const CONVERT_SWEEP_LIMIT = 20;

export interface SweepStats {
  converted: number;
  skipped: number;
  failed: number;
}

/**
 * Converts every booking that is approved but has produced no visit yet.
 *
 * Deliberately driven off local state rather than off the row that just arrived
 * on the sync cursor. A conversion that fails — the database busy, a test that
 * has not synced yet — must be tried again, and the cursor has already moved
 * past the approval by then. Sweeping for the condition itself means the work is
 * retried every tick until it succeeds, and needs no cursor of its own.
 */
export async function convertPendingApprovedBookings(): Promise<SweepStats> {
  const stats: SweepStats = { converted: 0, skipped: 0, failed: 0 };

  const pending = await prisma().booking.findMany({
    where: { status: "Approved", resultingVisitId: null },
    orderBy: { approvedAt: "asc" },
    take: CONVERT_SWEEP_LIMIT,
    select: { id: true },
  });

  for (const b of pending) {
    try {
      const res = await convertApprovedBooking(b.id);
      if (res.kind === "converted") stats.converted += 1;
      else stats.skipped += 1;
    } catch {
      // Left for the next sweep. Nothing partial survives — writeConversion is
      // one transaction — so retrying is safe.
      stats.failed += 1;
    }
  }

  return stats;
}

export async function declineBooking(input: DeclineInput): Promise<void> {
  if (!input.reason?.trim()) throw new Error("REASON_REQUIRED");
  await prisma().$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!b) throw new Error("NOT_FOUND");
    if (b.status !== "Pending") throw new Error("INVALID_STATE");
    if (input.expectedVersion !== undefined && b.version !== input.expectedVersion) {
      throw new Error("STALE_VERSION");
    }
    await tx.booking.update({
      where: { id: b.id },
      data: { status: "Declined", declineReason: input.reason, version: { increment: 1 } },
    });
  });
}

function safeParseTestIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
