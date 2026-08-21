// Phase 3d Plan F — bookings service.
// Approving a booking is an atomic conversion: Booking + Patient + Visit +
// HomeVisit + Invoice all written in a single Prisma transaction. If anything
// throws, the booking stays Pending and nothing leaks.
//
// Patient resolution rules — the phone alone never decides:
//   0 matches by phone   → create a new Patient (createdNewPatient: true).
//   1 match, same name   → reuse it.
//   1 match, other name  → { kind: "chooser" }. A household shares one number,
//                          and the second person to book on it is not the first.
//   ≥2 matches           → { kind: "chooser" } so the staff can decide whether
//                          this booking belongs to an existing family member or
//                          to a brand-new "extra" patient on the line.
//
// Optimistic concurrency: callers may pass `expectedVersion`; if the booking's
// `version` no longer matches, the transaction throws STALE_VERSION.

import { prisma } from "@main/db";
import { nextPatientId, nextVisitId } from "./id-generator";
import { domainError } from "@shared/domain-error";

export interface PatientChoice {
  id: string;
  patientId: string;
  name: string;
  age: number;
  sex: string;
}

/** What the confirmation call found. Never inferred — staff pick one. */
export type PhoneConfirmOutcome = "Reached" | "NoAnswer";

export interface ApproveInput {
  bookingId: string;
  staffUserId: string;
  assignedToUserId: string | null;
  /** When the chooser surfaced previously, the staff's selection. "__new__"
   *  means create a fresh patient even though phone matches existed. */
  chosenPatientId?: string | null;
  /**
   * Outcome of the call staff make before approving.
   *
   * Required, and with no default on purpose. A booking's phone becomes the
   * patient's portal login the moment it is approved, so "we never checked" and
   * "we checked and nobody answered" have to be distinguishable afterwards —
   * a default would quietly record whichever one was cheaper to leave alone.
   */
  phoneConfirmOutcome: PhoneConfirmOutcome;
  expectedVersion?: number;
}

export type ApproveResult =
  | {
      kind: "approved";
      visitId: string;
      patientId: string;
      createdNewPatient: boolean;
      /**
       * The record this booking ended up on, for the screen to read back.
       *
       * The approve dialog used to name only the booking, so a reuse and a fresh
       * patient looked identical from there — which is how BKG-2026-00004 landed
       * on another household member's record with nobody noticing.
       */
      patientDisplayId: string;
      patientName: string;
    }
  | { kind: "chooser"; candidates: PatientChoice[] };

export interface DeclineInput {
  bookingId: string;
  reason: string;
  expectedVersion?: number;
}

/**
 * Whether a booking's name and an existing record's name are the same person.
 *
 * Deliberately strict: case and spacing are noise from a web form, and anything
 * beyond that is a different name and therefore a question for a human. Fuzzy
 * matching would decide on its own that "Sujata" and "Sujata Mahato" are one
 * person and that "Rohan" and "Rounak" are two, and it will be wrong about one
 * of those in some household. Being wrong here writes one patient's results onto
 * another's record, so the cost of asking is the cheaper side of the trade.
 */
function normaliseName(name: string | null | undefined): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normaliseName(a);
  // Two blanks are not a match. A record with no name is not evidence of anything.
  return left.length > 0 && left === normaliseName(b);
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
  if (!booking) throw domainError("NOT_FOUND");
  if (booking.status !== "Pending") throw domainError("INVALID_STATE");
  if (input.expectedVersion !== undefined && booking.version !== input.expectedVersion) {
    throw domainError("STALE_VERSION");
  }

  const candidates = await listPatientCandidatesByPhone(booking.patientPhone);
  const wantsNew = input.chosenPatientId === "__new__";

  // Decide which patient this booking is for.
  let target: PatientChoice | null = null;
  let createdNewPatient = false;

  if (input.chosenPatientId && input.chosenPatientId !== "__new__") {
    // Caller explicitly chose an existing patient. Validate they're still a candidate.
    const chosen = candidates.find((c) => c.id === input.chosenPatientId);
    if (!chosen) throw domainError("INVALID_INPUT");
    target = chosen;
  } else if (candidates.length === 0 || wantsNew) {
    target = null; // we'll create one inside the txn
    createdNewPatient = true;
  } else if (candidates.length === 1 && namesMatch(candidates[0]!.name, booking.patientName)) {
    // The same person booking again. Anything else about them may have changed;
    // the name is the only thing saying it is still them.
    target = candidates[0]!;
  } else {
    // One match under another name, or several — either way the phone has stopped
    // being an answer and become a question. Surface the chooser.
    return { kind: "chooser", candidates };
  }

  const result = await writeConversion({
    booking,
    staffUserId: input.staffUserId,
    assignedToUserId: input.assignedToUserId,
    phoneConfirmOutcome: input.phoneConfirmOutcome,
    target,
    expectedVersion: input.expectedVersion,
    requireStatus: "Pending",
  });

  return { kind: "approved", ...result, createdNewPatient };
}

/** The booking row as this service reads it. */
type BookingRow = Awaited<ReturnType<typeof loadBooking>>;
async function loadBooking(id: string) {
  const b = await prisma().booking.findUnique({ where: { id } });
  if (!b) throw domainError("NOT_FOUND");
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
  /** Null when the approval came from the staff portal, which does not ask. */
  phoneConfirmOutcome: PhoneConfirmOutcome | null;
  /** The existing record this booking belongs to, or null to create one. */
  target: PatientChoice | null;
  expectedVersion?: number;
  requireStatus: "Pending" | "Approved";
}): Promise<{
  visitId: string;
  patientId: string;
  patientDisplayId: string;
  patientName: string;
}> {
  const { booking, target } = opts;

  const visitDisplayId = await nextVisitId();
  const newPatientDisplayId = target ? null : await nextPatientId();
  const testIds: string[] = safeParseTestIds(booking.testIds);

  const result = await prisma().$transaction(async (tx) => {
    // Re-check inside the txn to defend against a parallel approval/decline that
    // flipped the status between read and write.
    const fresh = await tx.booking.findUnique({ where: { id: booking.id } });
    if (!fresh) throw domainError("NOT_FOUND");
    if (fresh.status !== opts.requireStatus) throw domainError("INVALID_STATE");
    // Converting a booking that already produced a visit would give one request
    // two visits, two invoices and two bills.
    if (fresh.resultingVisitId) throw domainError("ALREADY_CONVERTED");
    if (opts.expectedVersion !== undefined && fresh.version !== opts.expectedVersion) {
      throw domainError("STALE_VERSION");
    }

    let patientId: string;
    if (target) {
      patientId = target.id;
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

    // The booking names tests the *portal* chose from the *cloud* catalogue, and
    // this machine's catalogue can be behind — reconciliation retires duplicates
    // locally and the cloud only finds out when the catalogue is next pushed.
    //
    // The unchecked version priced the visit from the tests it found but built
    // visitTests from every id the booking carried, so an id unknown here
    // reached the foreign key and took the whole transaction down with it, with
    // nothing to say which id was at fault. Refusing by name is the same
    // refusal, arriving somewhere a human can read it.
    //
    // Converting the recognised subset instead would under-bill the patient and
    // print a report missing the test they came for. Neither belongs in a step
    // that runs unattended.
    const found = new Set(tests.map((t) => t.id));
    const unknown = testIds.filter((id) => !found.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `UNKNOWN_TESTS: this machine's catalogue has no test ${unknown.join(", ")} — ` +
          `the booking cannot be priced until it does.`,
      );
    }

    const subtotal = tests.reduce((s, t) => s + Number(t.price), 0);

    const visit = await tx.visit.create({
      data: {
        visitId: visitDisplayId,
        patientId,
        type: "HomeCollection",
        visitDate: booking.preferredDate,
        status: "Open",
        staffId: opts.staffUserId,
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
        // Left untouched when the portal approved: recording "no call" there
        // would overwrite an outcome the desktop may already have stored.
        ...(opts.phoneConfirmOutcome
          ? {
              phoneConfirmOutcome: opts.phoneConfirmOutcome,
              phoneConfirmedAt: new Date(),
              phoneConfirmedById: opts.staffUserId,
            }
          : {}),
        version: { increment: 1 },
      },
    });

    return {
      visitId: visit.id,
      patientId,
      patientDisplayId: target?.patientId ?? newPatientDisplayId!,
      patientName: target?.name ?? booking.patientName,
    };
  });

  return result;
}

/** Why a synced booking could not be turned into a visit without a human. */
export type ConversionSkip =
  | "not_approved"
  | "already_converted"
  | "ambiguous_patient"
  | "name_mismatch";

export type ConvertResult =
  | { kind: "converted"; visitId: string; patientId: string }
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
/**
 * Which local user to record as having created the patient and the visit.
 *
 * This was `booking.approvedByUserId ?? "system"`. No user has the id "system",
 * so a booking whose approver had not reached this machine — or which carried no
 * approver at all — failed the foreign key on `Patient.createdById`, rolled the
 * whole conversion back, and was retried every tick for the life of the install.
 *
 * Losing a patient's booking over the question of which staff member approved it
 * is the wrong trade; the same one was already settled this way for results in
 * 309a97f. An admin is a truthful enough answer — a real person who is
 * accountable for the lab — and the booking records the original approver
 * regardless, so nothing about who decided is lost.
 */
async function resolveConversionStaffId(approvedByUserId: string | null): Promise<string> {
  if (approvedByUserId) {
    const approver = await prisma().user.findUnique({
      where: { id: approvedByUserId },
      select: { id: true },
    });
    if (approver) return approver.id;
  }

  const admin = await prisma().user.findFirst({
    where: { role: "Admin", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (admin) return admin.id;

  // A lab with no active admin cannot have approved anything. Named so the log
  // says this rather than reporting a foreign key three calls deeper.
  throw new Error("NO_ATTRIBUTABLE_USER: no active Admin to record as the creator");
}

export async function convertApprovedBooking(bookingId: string): Promise<ConvertResult> {
  const booking = await loadBooking(bookingId);

  if (booking.status !== "Approved") return { kind: "skipped", reason: "not_approved" };
  if (booking.resultingVisitId) return { kind: "skipped", reason: "already_converted" };

  const candidates = await listPatientCandidatesByPhone(booking.patientPhone);

  // Households share a phone number. Which member a booking belongs to is a
  // judgement the staff make at the desktop's chooser; guessing here would file
  // one person's results under another's record. Left for a human instead —
  // see resolveApprovedBooking, which is how that human answers it.
  if (candidates.length > 1) return { kind: "skipped", reason: "ambiguous_patient" };

  // One match, but the booking names somebody else. This sweep runs unattended,
  // so there is nobody to ask — and taking the record anyway is exactly what put
  // one household member's home visit onto another's history and handed out her
  // portal account with it. Same answer as the shared phone: wait for a human.
  if (candidates.length === 1 && !namesMatch(candidates[0]!.name, booking.patientName)) {
    return { kind: "skipped", reason: "name_mismatch" };
  }

  const result = await writeConversion({
    booking,
    staffUserId: await resolveConversionStaffId(booking.approvedByUserId ?? null),
    assignedToUserId: booking.assignedToUserId ?? null,
    // The staff portal's Approve does not ask about the call, so there is no
    // outcome to record. Null here means "not asked", which is the truth, and
    // is deliberately distinct from "asked, nobody answered".
    phoneConfirmOutcome: null,
    target: candidates[0] ?? null,
    requireStatus: "Approved",
  });

  return { kind: "converted", visitId: result.visitId, patientId: result.patientId };
}

export interface ResolveApprovedInput {
  bookingId: string;
  /** The signed-in user doing the resolving. */
  staffUserId: string;
  /** The chosen household member, or "__new__" for a fresh patient. */
  chosenPatientId?: string | null;
}

export type ResolveApprovedResult =
  | { kind: "converted"; visitId: string; patientId: string }
  | { kind: "chooser"; candidates: PatientChoice[] };

/**
 * Finishes a booking the portal approved that the sweep will not convert alone.
 *
 * The sweep refuses to guess which household member a shared phone belongs to,
 * which is right — guessing files one person's results under another's name. But
 * `approveBooking` refuses anything that is no longer `Pending`, so once the
 * portal had written Approved there was nowhere left to answer the question. The
 * booking read as approved to the patient and to staff, no patient record
 * existed, and nothing in the system could put it right.
 *
 * This is the missing half: the same conversion, entered from the state the
 * portal leaves behind rather than from `Pending`. It shares `writeConversion`
 * with both other paths, so a booking finished here is indistinguishable from
 * one approved at the desktop.
 */
export async function resolveApprovedBooking(
  input: ResolveApprovedInput,
): Promise<ResolveApprovedResult> {
  const booking = await loadBooking(input.bookingId);

  if (booking.status !== "Approved") throw domainError("INVALID_STATE");
  if (booking.resultingVisitId) throw domainError("ALREADY_CONVERTED");

  const candidates = await listPatientCandidatesByPhone(booking.patientPhone);
  const wantsNew = input.chosenPatientId === "__new__";

  let target: PatientChoice | null = null;
  if (input.chosenPatientId && !wantsNew) {
    // A patient id that is not on this phone is someone else's record.
    const chosen = candidates.find((c) => c.id === input.chosenPatientId);
    if (!chosen) throw domainError("INVALID_INPUT");
    target = chosen;
  } else if (!wantsNew) {
    // Nothing chosen yet — hand back the candidates so the staff can pick.
    return { kind: "chooser", candidates };
  }

  const result = await writeConversion({
    booking,
    staffUserId: input.staffUserId,
    assignedToUserId: booking.assignedToUserId ?? null,
    // The desktop asks about the confirmation call at approval, which already
    // happened in the portal. Recording an outcome now would claim a call this
    // screen never prompted anyone to make.
    phoneConfirmOutcome: null,
    target,
    requireStatus: "Approved",
  });

  return { kind: "converted", visitId: result.visitId, patientId: result.patientId };
}

/** How many approvals one sweep will convert, so a backlog cannot stall a tick. */
const CONVERT_SWEEP_LIMIT = 20;

export interface SweepStats {
  converted: number;
  skipped: number;
  failed: number;
  /**
   * What each conversion produced, so the caller can tell the patient their home
   * visit is confirmed. The notifications live with the puller rather than here,
   * where the rest of the booking triggers already are.
   */
  convertedItems: Array<{ bookingId: string; visitId: string }>;
  /**
   * Why each conversion failed.
   *
   * This used to be a bare `catch` that incremented a counter and dropped the
   * error on the floor, and the puller logged only the counts. A booking
   * approved on a phone whose conversion failed every tick therefore produced no
   * error text anywhere in the system — the only symptom was a booking marked
   * Approved with no patient behind it, and no way to find out why. Knowing that
   * something failed is not the same as being able to fix it.
   */
  failures: Array<{ bookingId: string; error: string }>;
  /**
   * Bookings the sweep deliberately declined to convert, and why.
   *
   * `ambiguous_patient` and `name_mismatch` in particular are dead ends rather
   * than waits: the desktop's own Approve button refuses anything that is no
   * longer Pending, so nothing in the system can finish these. Naming them is
   * what makes them findable by a human.
   */
  skippedItems: Array<{ bookingId: string; reason: ConversionSkip }>;
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
  const stats: SweepStats = {
    converted: 0,
    skipped: 0,
    failed: 0,
    convertedItems: [],
    failures: [],
    skippedItems: [],
  };

  const pending = await prisma().booking.findMany({
    where: { status: "Approved", resultingVisitId: null },
    orderBy: { approvedAt: "asc" },
    take: CONVERT_SWEEP_LIMIT,
    select: { id: true },
  });

  for (const b of pending) {
    try {
      const res = await convertApprovedBooking(b.id);
      if (res.kind === "converted") {
        stats.converted += 1;
        stats.convertedItems.push({ bookingId: b.id, visitId: res.visitId });
      } else {
        stats.skipped += 1;
        stats.skippedItems.push({ bookingId: b.id, reason: res.reason });
      }
    } catch (e) {
      // Left for the next sweep. Nothing partial survives — writeConversion is
      // one transaction — so retrying is safe. The reason is kept because
      // retrying forever without one is what made this invisible.
      stats.failed += 1;
      stats.failures.push({
        bookingId: b.id,
        error: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  }

  return stats;
}

/** A booking the portal marked Approved that never became a Patient and Visit. */
export interface UnconvertedApproval {
  id: string;
  bookingId: string;
  patientName: string;
  patientPhone: string;
  approvedAt: Date | null;
}

/**
 * Approvals that produced no visit — the read-only view of what the sweep keeps
 * failing or declining to convert.
 *
 * Approving in the staff portal writes the status straight to the cloud, while
 * the Patient and Visit are created later, on this machine, in a step that can
 * fail on its own. Nothing rolls the status back when it does, so the booking
 * reads "Approved" to the patient and to staff while no patient record exists.
 *
 * The Bookings screen defaults to the Pending filter, where such a booking never
 * appears. Counting them separately is what lets the screen say so without the
 * owner having to go looking under a filter he has no reason to select.
 */
export async function listUnconvertedApprovals(): Promise<UnconvertedApproval[]> {
  return prisma().booking.findMany({
    where: { status: "Approved", resultingVisitId: null },
    orderBy: { approvedAt: "asc" },
    select: {
      id: true,
      bookingId: true,
      patientName: true,
      patientPhone: true,
      approvedAt: true,
    },
  });
}

export async function declineBooking(input: DeclineInput): Promise<void> {
  if (!input.reason?.trim()) throw domainError("REASON_REQUIRED");
  await prisma().$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!b) throw domainError("NOT_FOUND");
    if (b.status !== "Pending") throw domainError("INVALID_STATE");
    if (input.expectedVersion !== undefined && b.version !== input.expectedVersion) {
      throw domainError("STALE_VERSION");
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
