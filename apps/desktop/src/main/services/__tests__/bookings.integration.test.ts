import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { applyPendingMigrations } from "../apply-migrations";

/**
 * The booking → patient conversion, against a real database.
 *
 * Everything else covering this path mocks Prisma, so it proves the service
 * calls the right methods and proves nothing about whether SQLite accepts the
 * result. That gap is exactly where the bug lived: `visitTests.create` was built
 * from test ids that were never checked against the catalogue, and the creator
 * was the string "system", which is not a user. Both are foreign keys. A mocked
 * Prisma has no foreign keys, so both looked perfectly healthy in a green suite
 * while every conversion failed on the lab's actual machine.
 *
 * These run the sweep end to end on a real migrated database with real
 * constraints, which is the only way this class of fault shows up.
 */

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => "." } }));

// The mock factory is evaluated at import time but `prisma()` is called later,
// so the holder can be filled in beforeAll once the temp database exists.
const holder = vi.hoisted(() => ({ client: null as unknown as PrismaClient }));
vi.mock("@main/db", () => ({ prisma: () => holder.client }));

import { convertPendingApprovedBookings, resolveApprovedBooking } from "../bookings.service";

const MIGRATIONS_DIR = join(process.cwd(), "../../packages/db/prisma/migrations");
const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "lab-booking-int-"));
const tmpDb = join(tmpDir, "test.sqlite");

let db: PrismaClient;

beforeAll(async () => {
  db = new PrismaClient({ datasources: { db: { url: "file:" + tmpDb } } });
  holder.client = db;
  await applyPendingMigrations(db as never, MIGRATIONS_DIR);
  // Prisma's SQLite connector enables this, but the whole point of this file is
  // to exercise the constraints, so it is asserted rather than assumed below.
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
});

afterAll(async () => {
  await db.$disconnect();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

/** Wipes and re-seeds the fixtures every test needs. */
beforeEach(async () => {
  await db.homeVisit.deleteMany();
  await db.invoice.deleteMany();
  await db.visitTest.deleteMany();
  await db.visit.deleteMany();
  await db.booking.deleteMany();
  await db.patient.deleteMany();
  await db.idReservation.deleteMany();
  await db.idCounter.deleteMany();
  await db.test.deleteMany();
  await db.user.deleteMany();
  await db.doctor.deleteMany();

  await db.doctor.create({
    data: { id: "doctor-self", name: "Self", isActive: true },
  });
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
    data: { id: "test-cbc", name: "Complete Blood Count", category: "Blood", price: 300 },
  });
});

/** A booking the staff portal has approved, as the puller would have left it. */
async function approvedBooking(over: Record<string, unknown> = {}) {
  return db.booking.create({
    data: {
      bookingId: "BKG-2026-00001",
      patientPhone: "9876543210",
      patientName: "Sujata Mahato",
      patientEmail: "sujata@example.com",
      address: "Golmuri Chowk",
      testIds: JSON.stringify(["test-cbc"]),
      preferredDate: new Date("2026-08-10T04:00:00Z"),
      preferredSlot: "Morning",
      status: "Approved",
      approvedByUserId: "admin-1",
      approvedAt: new Date("2026-08-05T10:00:00Z"),
      ...over,
    },
  });
}

describe("converting an approved booking, against a real database", () => {
  it("creates the patient, visit, tests, invoice and home visit", async () => {
    await approvedBooking();

    const swept = await convertPendingApprovedBookings();

    expect(swept).toMatchObject({ converted: 1, failed: 0 });
    expect(swept.failures).toEqual([]);

    const patient = await db.patient.findFirst();
    expect(patient).toMatchObject({
      name: "Sujata Mahato",
      phone: "9876543210",
      createdById: "admin-1",
    });
    expect(patient!.patientId).toMatch(/^LAB-\d{4}-\d{5}$/);

    const visit = await db.visit.findFirst({ include: { visitTests: true, invoice: true } });
    expect(visit).toMatchObject({ type: "HomeCollection", status: "Open", staffId: "admin-1" });
    expect(visit!.patientId).toBe(patient!.id);
    expect(visit!.visitTests).toHaveLength(1);
    expect(visit!.visitTests[0]!.testId).toBe("test-cbc");
    expect(Number(visit!.invoice!.total)).toBe(300);

    const homeVisit = await db.homeVisit.findFirst();
    expect(homeVisit).toMatchObject({ bookerPhone: "9876543210", status: "Booked" });

    // The booking must point at what it produced, or the next sweep converts it
    // again and the patient is billed twice.
    const booking = await db.booking.findFirst();
    expect(booking!.resultingVisitId).toBe(visit!.id);
    expect(booking!.resultingPatientId).toBe(patient!.id);
  });

  it("does not convert the same booking twice", async () => {
    await approvedBooking();

    await convertPendingApprovedBookings();
    const second = await convertPendingApprovedBookings();

    expect(second.converted).toBe(0);
    expect(await db.visit.count()).toBe(1);
    expect(await db.invoice.count()).toBe(1);
  });

  // The access-code columns this used to assert on are gone from Visit
  // entirely — see retire-access-code.migration.test.ts, which drives the real
  // migration runner over a database holding real rows and checks what
  // survived the table rebuild.
});

describe("the failures that were previously silent", () => {
  // The catalogue drift bug. The booking names a test the desktop has never
  // heard of; unchecked, this reached the foreign key on VisitTest.testId and
  // rolled the whole transaction back with no reason recorded anywhere.
  it("reports the missing test by name instead of dying on a foreign key", async () => {
    await approvedBooking({ testIds: JSON.stringify(["test-cbc", "test-vanished"]) });

    const swept = await convertPendingApprovedBookings();

    expect(swept.converted).toBe(0);
    expect(swept.failed).toBe(1);
    expect(swept.failures[0]!.error).toContain("UNKNOWN_TESTS");
    expect(swept.failures[0]!.error).toContain("test-vanished");
  });

  it("leaves nothing half-created when it refuses", async () => {
    await approvedBooking({ testIds: JSON.stringify(["test-cbc", "test-vanished"]) });

    await convertPendingApprovedBookings();

    expect(await db.patient.count()).toBe(0);
    expect(await db.visit.count()).toBe(0);
    expect(await db.invoice.count()).toBe(0);
  });

  // The "system" bug: the approver had not synced to this machine, so the
  // creator was a user id that does not exist.
  it("still converts when the approver is unknown to this machine", async () => {
    await approvedBooking({ approvedByUserId: "user-who-never-synced" });

    const swept = await convertPendingApprovedBookings();

    expect(swept).toMatchObject({ converted: 1, failed: 0 });
    expect((await db.patient.findFirst())!.createdById).toBe("admin-1");
  });

  it("still converts when no approver was recorded at all", async () => {
    await approvedBooking({ approvedByUserId: null });

    const swept = await convertPendingApprovedBookings();

    expect(swept).toMatchObject({ converted: 1, failed: 0 });
  });

  // Proves the constraints this file relies on are actually live. Without it a
  // silently-disabled foreign key would make every test above pass for the
  // wrong reason — which is the exact failure mode being guarded against.
  it("really does enforce foreign keys", async () => {
    await expect(
      db.visit.create({
        data: {
          visitId: "VIS-2026-09999",
          patientId: "no-such-patient",
          type: "WalkIn",
          visitDate: new Date(),
          staffId: "admin-1",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("a booking on a phone two patients share", () => {
  beforeEach(async () => {
    await db.patient.create({
      data: {
        patientId: "LAB-2026-00001",
        name: "Sujata Mahato",
        age: 44,
        sex: "Female",
        phone: "9876543210",
        createdById: "admin-1",
        referredById: "doctor-self",
      },
    });
    await db.patient.create({
      data: {
        patientId: "LAB-2026-00002",
        name: "Rohan Mahato",
        age: 12,
        sex: "Male",
        phone: "9876543210",
        createdById: "admin-1",
        referredById: "doctor-self",
      },
    });
  });

  it("is left for a human rather than guessed at", async () => {
    await approvedBooking();

    const swept = await convertPendingApprovedBookings();

    expect(swept.skippedItems).toEqual([
      { bookingId: expect.any(String), reason: "ambiguous_patient" },
    ]);
    expect(await db.visit.count()).toBe(0);
  });

  // Before resolveApprovedBooking existed this was the end of the road: the
  // sweep would not guess, and the desktop's Approve button refuses anything
  // that is no longer Pending.
  it("can be finished once the staff say which patient it is", async () => {
    const b = await approvedBooking();
    await convertPendingApprovedBookings();

    const offered = await resolveApprovedBooking({ bookingId: b.id, staffUserId: "admin-1" });
    expect(offered.kind).toBe("chooser");

    const existing = await db.patient.findFirst({ where: { patientId: "LAB-2026-00002" } });
    const result = await resolveApprovedBooking({
      bookingId: b.id,
      staffUserId: "admin-1",
      chosenPatientId: existing!.id,
    });

    expect(result.kind).toBe("converted");
    const visit = await db.visit.findFirst({ include: { invoice: true } });
    expect(visit!.patientId).toBe(existing!.id);
    expect(Number(visit!.invoice!.total)).toBe(300);
    // No third patient invented for a phone that already had two.
    expect(await db.patient.count()).toBe(2);
  });
});
