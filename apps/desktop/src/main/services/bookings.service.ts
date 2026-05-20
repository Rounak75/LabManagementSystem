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

  const { plaintext: accessCode, hash: accessCodeHash } = await generateAndHash();
  const visitDisplayId = await nextVisitId();
  const newPatientDisplayId = createdNewPatient ? await nextPatientId() : null;
  const testIds: string[] = safeParseTestIds(booking.testIds);

  // Phase 2: atomic write.
  const result = await prisma().$transaction(async (tx) => {
    // Re-check the booking inside the txn to defend against a parallel
    // approval/decline that flipped the status between read and write.
    const fresh = await tx.booking.findUnique({ where: { id: booking.id } });
    if (!fresh) throw new Error("NOT_FOUND");
    if (fresh.status !== "Pending") throw new Error("INVALID_STATE");
    if (input.expectedVersion !== undefined && fresh.version !== input.expectedVersion) {
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
          createdById: input.staffUserId,
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
        staffId: input.staffUserId,
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
        assignedToId: input.assignedToUserId ?? null,
        status: "Booked",
        visitId: visit.id,
      },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "Approved",
        approvedByUserId: input.staffUserId,
        approvedAt: new Date(),
        assignedToUserId: input.assignedToUserId ?? null,
        resultingVisitId: visit.id,
        resultingPatientId: patientId,
        version: { increment: 1 },
      },
    });

    return { visitId: visit.id, patientId };
  });

  return {
    kind: "approved",
    visitId: result.visitId,
    patientId: result.patientId,
    accessCode,
    createdNewPatient,
  };
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
