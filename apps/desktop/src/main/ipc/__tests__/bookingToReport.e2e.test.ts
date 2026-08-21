import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { applyPendingMigrations } from "@main/services/apply-migrations";

/**
 * One patient's whole journey, through the real IPC handlers against a real
 * database: the booking the portal wrote → approval → the visit, its tests, its
 * bill and the home collection → results typed in → verified and locked → the
 * bill settled → the report standing ready to print.
 *
 * Every stage of that chain has tests of its own, and each one passed while the
 * chain itself was broken: BKG-2026-00004 was approved onto a different member
 * of the same household, so the patient who booked got no record, and the
 * booking id signed him into her portal account instead. Nothing between the
 * booking and the report noticed, because nothing looked at more than one link.
 *
 * This walks the links in order. It exists to fail when the seams move, which is
 * where that fault lived — not in any of the stages it joins.
 */

const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "lab-e2e-"));
const tmpDb = join(tmpDir, "test.sqlite");

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => tmpDir },
}));

const holder = vi.hoisted(() => ({ client: null as unknown as PrismaClient }));
vi.mock("@main/db", () => ({ prisma: () => holder.client }));

// The one admin the lab actually has. Every handler here authenticates first.
vi.mock("@main/session", () => ({
  requireAdmin: () => ({ id: "admin-1", role: "Admin" }),
  requireSession: () => ({ id: "admin-1", role: "Admin" }),
}));
vi.mock("@main/services/audit.service", () => ({ audit: vi.fn() }));
vi.mock("@main/services/audit-best-effort", () => ({ audit: { try: vi.fn() } }));

// Mail and print reach the network and a printer. What matters here is which of
// them the chain fires and for which visit, so they are recorded, not run.
const sent = vi.hoisted(() => ({
  bookingApproved: [] as string[],
  visitBooked: [] as string[],
  reportReady: [] as string[],
  paymentReceived: [] as string[],
}));
vi.mock("@main/services/notifications/triggers", () => ({
  bookingApproved: async (id: string) => void sent.bookingApproved.push(id),
  bookingDeclined: async () => {},
  visitBooked: async (id: string) => void sent.visitBooked.push(id),
  reportReady: async (id: string) => {
    sent.reportReady.push(id);
    return [];
  },
  paymentReceived: async (id: string) => void sent.paymentReceived.push(id),
}));
vi.mock("@main/services/payments/upi.service", () => ({ recordUpiPayment: vi.fn() }));

const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
vi.mock("@main/ipc", () => ({
  register: (name: string, fn: (input: unknown) => Promise<unknown>) => {
    handlers.set(name, fn);
  },
}));

const call = <T>(channel: string, input: unknown = {}): Promise<T> => {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler registered for ${channel}`);
  return fn(input) as Promise<T>;
};

const MIGRATIONS_DIR = join(process.cwd(), "../../packages/db/prisma/migrations");

let db: PrismaClient;

beforeAll(async () => {
  db = new PrismaClient({ datasources: { db: { url: "file:" + tmpDb } } });
  holder.client = db;
  await applyPendingMigrations(db as never, MIGRATIONS_DIR);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await import("../bookings.ipc");
  await import("../results.ipc");
  await import("../visits.ipc");
  await import("../invoices.ipc");
  await import("../reports.ipc");
});

afterAll(async () => {
  await db.$disconnect();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* the report directory may still be held on Windows */
  }
});

beforeEach(async () => {
  await db.testResult.deleteMany();
  await db.homeVisit.deleteMany();
  await db.invoice.deleteMany();
  await db.visitTest.deleteMany();
  await db.visit.deleteMany();
  await db.booking.deleteMany();
  await db.patient.deleteMany();
  await db.idReservation.deleteMany();
  await db.idCounter.deleteMany();
  await db.testParameter.deleteMany();
  await db.test.deleteMany();
  await db.user.deleteMany();
  await db.doctor.deleteMany();
  sent.bookingApproved.length = 0;
  sent.visitBooked.length = 0;
  sent.reportReady.length = 0;
  sent.paymentReceived.length = 0;

  await db.doctor.create({ data: { id: "doctor-self", name: "Self", isActive: true } });
  await db.user.create({
    data: {
      id: "admin-1",
      name: "Father",
      username: "admin",
      passwordHash: "x",
      role: "Admin",
      isActive: true,
    },
  });
  await db.test.create({
    data: {
      id: "test-fbs",
      name: "Blood Sugar Fasting",
      category: "Biochemistry",
      price: 150,
      parameters: {
        create: [
          {
            id: "param-fbs",
            name: "Glucose (Fasting)",
            unit: "mg/dL",
            // All three bounds, because which one applies depends on the
            // patient — and a booking-created patient starts at age 0 / "Other"
            // until the phlebotomist comes back with the real details, so the
            // child range is the one this journey actually reads.
            refRangeMaleMin: 70,
            refRangeMaleMax: 100,
            refRangeFemaleMin: 70,
            refRangeFemaleMax: 100,
            refRangeChildMin: 70,
            refRangeChildMax: 100,
            displayOrder: 1,
          },
        ],
      },
    },
  });
});

/** A booking exactly as pull-bookings leaves it after the portal writes one. */
async function pendingBooking(over: Record<string, unknown> = {}) {
  return db.booking.create({
    data: {
      bookingId: "BKG-2026-00004",
      patientPhone: "7321902777",
      patientName: "Rounak Kumar Mahato",
      patientEmail: "patient@example.com",
      address: "H/No.139, Line No.03, Bhuiyadih",
      pincode: "831009",
      testIds: JSON.stringify(["test-fbs"]),
      preferredDate: new Date("2026-08-22T00:00:00Z"),
      preferredSlot: "Morning",
      notes: "2nd Floor",
      status: "Pending",
      ...over,
    },
  });
}

interface Approved {
  kind: "approved";
  visitId: string;
  patientId: string;
  createdNewPatient: boolean;
  patientDisplayId: string;
  patientName: string;
}
interface Chooser {
  kind: "chooser";
  candidates: Array<{ id: string; patientId: string; name: string }>;
}

/** Booking → approved, results typed, verified, paid, report ready. */
async function walkToReportReady(visitId: string) {
  const visitTests = await db.visitTest.findMany({ where: { visitId } });
  for (const vt of visitTests) {
    await call("results:upsert", {
      visitTestId: vt.id,
      values: [{ parameterId: "param-fbs", value: "92" }],
    });
    await call("visitTests:lock", { visitTestId: vt.id });
  }

  const invoice = await db.invoice.findFirstOrThrow({ where: { visitId } });
  await call("invoices:recordCash", {
    invoiceId: invoice.id,
    amount: Number(invoice.total),
  });
}

describe("a patient's journey from the booking form to a printable report", () => {
  it("carries one booking through every stage on the right record", async () => {
    const booking = await pendingBooking();

    // 1. The lab rings the number, then approves.
    const approved = await call<Approved>("bookings:approve", {
      bookingId: booking.id,
      assignedToUserId: null,
      phoneConfirmOutcome: "Reached",
      expectedVersion: booking.version,
    });

    expect(approved.kind).toBe("approved");
    expect(approved.createdNewPatient).toBe(true);
    // The screen can name the record now. Not being able to is how a booking
    // filed onto the wrong patient looked exactly like a correct one.
    expect(approved.patientName).toBe("Rounak Kumar Mahato");
    expect(approved.patientDisplayId).toMatch(/^LAB-\d{4}-\d{5}$/);

    // 2. Approval created the patient, the visit, its tests, the bill and the
    //    home collection — and pointed the booking at what it produced.
    const patient = await db.patient.findFirstOrThrow();
    expect(patient).toMatchObject({ name: "Rounak Kumar Mahato", phone: "7321902777" });

    const visit = await db.visit.findFirstOrThrow({
      include: { visitTests: true, invoice: true },
    });
    expect(visit.patientId).toBe(patient.id);
    expect(visit).toMatchObject({ type: "HomeCollection", status: "Open" });
    expect(Number(visit.invoice!.total)).toBe(150);
    expect(visit.invoice!.paymentStatus).toBe("Pending");

    const homeVisit = await db.homeVisit.findFirstOrThrow();
    expect(homeVisit).toMatchObject({ bookerPhone: "7321902777", status: "Booked" });
    expect(homeVisit.visitId).toBe(visit.id);

    const afterApproval = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(afterApproval.status).toBe("Approved");
    expect(afterApproval.resultingPatientId).toBe(patient.id);
    expect(afterApproval.resultingVisitId).toBe(visit.id);
    // What the portal's booking-id login reads to decide whose profile to open.
    expect(afterApproval.phoneConfirmOutcome).toBe("Reached");

    // 3. The patient is told, once, about the visit they now have.
    expect(sent.bookingApproved).toEqual([booking.id]);
    expect(sent.visitBooked).toEqual([visit.id]);

    // 4. The phlebotomist collects; the result is typed in and verified.
    const visitTest = visit.visitTests[0]!;
    await call("results:upsert", {
      visitTestId: visitTest.id,
      values: [{ parameterId: "param-fbs", value: "92" }],
    });

    const result = await db.testResult.findFirstOrThrow();
    expect(result.value).toBe("92");
    // 92 sits inside 70–100, so nothing is flagged for the doctor's eye.
    expect(result.isAbnormal).toBe(false);

    await call("visitTests:lock", { visitTestId: visitTest.id });

    const locked = await db.visitTest.findUniqueOrThrow({ where: { id: visitTest.id } });
    expect(locked.isLocked).toBe(true);
    expect(locked.verifiedById).toBe("admin-1");
    // Every test verified closes the visit and readies the report.
    expect((await db.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe(
      "Completed",
    );
    expect(sent.reportReady).toEqual([visit.id]);

    // 5. The bill is settled at the counter.
    await call("invoices:recordCash", { invoiceId: visit.invoice!.id, amount: 150 });

    const paid = await db.invoice.findUniqueOrThrow({ where: { id: visit.invoice!.id } });
    expect(paid.paymentStatus).toBe("Paid");
    expect(Number(paid.amountPaid)).toBe(150);
    expect(sent.paymentReceived).toEqual([visit.invoice!.id]);

    // 6. The report is now in the print queue's list, on this patient's name.
    const ready = await call<Array<{ id: string; patient: { name: string } }>>(
      "reports:listReady",
    );
    expect(ready.map((v) => v.id)).toContain(visit.id);
    expect(ready.find((v) => v.id === visit.id)!.patient.name).toBe("Rounak Kumar Mahato");
  });

  // The fault this whole file exists for, walked end to end: a household where
  // one member is already registered on the phone the booking was made from.
  it("stops at the approval when the phone belongs to someone else, and finishes on a record of the booker's own", async () => {
    const sujata = await db.patient.create({
      data: {
        patientId: "LAB-2026-00002",
        name: "Sujata Mahato",
        age: 45,
        sex: "Female",
        phone: "7321902777",
        createdById: "admin-1",
        referredById: "doctor-self",
      },
    });
    const booking = await pendingBooking();

    // The approval refuses to decide. Nothing is written yet.
    const asked = await call<Chooser>("bookings:approve", {
      bookingId: booking.id,
      assignedToUserId: null,
      phoneConfirmOutcome: "Reached",
      expectedVersion: booking.version,
    });

    expect(asked.kind).toBe("chooser");
    expect(asked.candidates.map((c) => c.name)).toEqual(["Sujata Mahato"]);
    expect(await db.visit.count()).toBe(0);
    expect(await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({
      status: "Pending",
    });
    expect(sent.bookingApproved).toEqual([]);

    // The staff answer: a different member of the household.
    const approved = await call<Approved>("bookings:approve", {
      bookingId: booking.id,
      assignedToUserId: null,
      chosenPatientId: "__new__",
      phoneConfirmOutcome: "Reached",
      expectedVersion: booking.version,
    });

    expect(approved).toMatchObject({
      kind: "approved",
      createdNewPatient: true,
      patientName: "Rounak Kumar Mahato",
    });
    expect(approved.patientId).not.toBe(sujata.id);

    // Sujata's record is untouched: no visit, no bill, no history that is not hers.
    expect(await db.visit.count({ where: { patientId: sujata.id } })).toBe(0);

    const visit = await db.visit.findFirstOrThrow();
    expect(visit.patientId).toBe(approved.patientId);

    // And the rest of the chain runs on the record the booking actually made.
    await walkToReportReady(visit.id);

    const ready = await call<Array<{ id: string; patient: { name: string; phone: string } }>>(
      "reports:listReady",
    );
    expect(ready).toHaveLength(1);
    expect(ready[0]!.patient).toMatchObject({
      name: "Rounak Kumar Mahato",
      phone: "7321902777",
    });
    expect(
      Number((await db.invoice.findFirstOrThrow({ where: { visitId: visit.id } })).amountPaid),
    ).toBe(150);
  });

  // The ordinary repeat visit this must not have made harder: same person, same
  // phone, booking again. No question, no second record.
  it("adds a repeat booking to the patient's existing record without asking", async () => {
    const existing = await db.patient.create({
      data: {
        patientId: "LAB-2026-00002",
        name: "Rounak Kumar Mahato",
        age: 24,
        sex: "Male",
        phone: "7321902777",
        createdById: "admin-1",
        referredById: "doctor-self",
      },
    });
    const booking = await pendingBooking();

    const approved = await call<Approved>("bookings:approve", {
      bookingId: booking.id,
      assignedToUserId: null,
      phoneConfirmOutcome: "Reached",
      expectedVersion: booking.version,
    });

    expect(approved).toMatchObject({
      kind: "approved",
      createdNewPatient: false,
      patientId: existing.id,
      patientDisplayId: "LAB-2026-00002",
      patientName: "Rounak Kumar Mahato",
    });
    expect(await db.patient.count()).toBe(1);

    const visit = await db.visit.findFirstOrThrow();
    expect(visit.patientId).toBe(existing.id);

    await walkToReportReady(visit.id);
    expect((await db.visit.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe(
      "Completed",
    );
  });
});
