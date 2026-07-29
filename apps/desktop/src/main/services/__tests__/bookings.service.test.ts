import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Approving a home-collection booking is the one place a Patient, a Visit, its
 * VisitTests, an Invoice and a HomeVisit are created together from a stranger's
 * web form. It handles money and creates patient records, and had no tests at
 * all — so nothing said which of its rules were deliberate.
 */

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => "." } }));

const mocks = vi.hoisted(() => ({
  bookingFindUnique: vi.fn(),
  bookingFindMany: vi.fn(),
  patientFindMany: vi.fn(),
  transaction: vi.fn(),
  txBookingFindUnique: vi.fn(),
  txPatientCreate: vi.fn(),
  txTestFindMany: vi.fn(),
  txVisitCreate: vi.fn(),
  txHomeVisitCreate: vi.fn(),
  txBookingUpdate: vi.fn(),
  nextPatientId: vi.fn(),
  nextVisitId: vi.fn(),
  generateAndHash: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    booking: { findUnique: mocks.bookingFindUnique, findMany: mocks.bookingFindMany },
    patient: { findMany: mocks.patientFindMany },
    $transaction: mocks.transaction,
  }),
}));
vi.mock("../id-generator", () => ({
  nextPatientId: mocks.nextPatientId,
  nextVisitId: mocks.nextVisitId,
}));
vi.mock("../access-code.service", () => ({ generateAndHash: mocks.generateAndHash }));

import {
  approveBooking,
  convertApprovedBooking,
  convertPendingApprovedBookings,
} from "../bookings.service";

const tx = {
  booking: { findUnique: mocks.txBookingFindUnique, update: mocks.txBookingUpdate },
  patient: { create: mocks.txPatientCreate },
  test: { findMany: mocks.txTestFindMany },
  visit: { create: mocks.txVisitCreate },
  homeVisit: { create: mocks.txHomeVisitCreate },
};

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    bookingId: "BKG-2026-00001",
    patientPhone: "9876543210",
    patientName: "Sujata Mahato",
    patientEmail: null,
    address: "Golmuri",
    testIds: JSON.stringify(["t1", "t2"]),
    preferredDate: new Date("2026-08-02"),
    preferredSlot: "Morning",
    status: "Pending",
    version: 0,
    ...over,
  };
}

const input = { bookingId: "b1", staffUserId: "staff-1", assignedToUserId: "phleb-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bookingFindUnique.mockResolvedValue(booking());
  mocks.txBookingFindUnique.mockResolvedValue(booking());
  mocks.patientFindMany.mockResolvedValue([]);
  mocks.nextPatientId.mockResolvedValue("LAB-2026-00042");
  mocks.nextVisitId.mockResolvedValue("VIS-2026-00042");
  mocks.generateAndHash.mockResolvedValue({ plaintext: "K9XF2A", hash: "hashed" });
  mocks.txPatientCreate.mockResolvedValue({ id: "p-new" });
  mocks.txTestFindMany.mockResolvedValue([
    { id: "t1", price: 300 },
    { id: "t2", price: 200 },
  ]);
  mocks.txVisitCreate.mockResolvedValue({ id: "v-new" });
  mocks.txHomeVisitCreate.mockResolvedValue({});
  mocks.txBookingUpdate.mockResolvedValue({});
  mocks.bookingFindMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
});

/** A booking the staff portal has already marked Approved. */
function portalApproved(over: Record<string, unknown> = {}) {
  return booking({
    status: "Approved",
    approvedByUserId: "admin-1",
    approvedAt: new Date("2026-07-29T10:00:00Z"),
    assignedToUserId: "phleb-2",
    resultingVisitId: null,
    ...over,
  });
}

describe("approveBooking", () => {
  it("refuses a booking that does not exist", async () => {
    mocks.bookingFindUnique.mockResolvedValue(null);
    await expect(approveBooking(input)).rejects.toThrow("NOT_FOUND");
  });

  // Approving twice would create a second patient, visit and invoice for one
  // request, and bill the patient for both.
  it("refuses a booking that is no longer Pending", async () => {
    mocks.bookingFindUnique.mockResolvedValue(booking({ status: "Approved" }));
    await expect(approveBooking(input)).rejects.toThrow("INVALID_STATE");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses when the booking changed since the staff last saw it", async () => {
    await expect(approveBooking({ ...input, expectedVersion: 3 })).rejects.toThrow("STALE_VERSION");
  });

  describe("which patient the booking belongs to", () => {
    it("creates a new patient when the phone matches nobody", async () => {
      const res = await approveBooking(input);

      expect(res).toMatchObject({ kind: "approved", createdNewPatient: true, patientId: "p-new" });
      expect(mocks.txPatientCreate).toHaveBeenCalledOnce();
      expect(mocks.txPatientCreate.mock.calls[0]![0].data).toMatchObject({
        patientId: "LAB-2026-00042",
        phone: "9876543210",
        name: "Sujata Mahato",
      });
    });

    it("reuses the patient when the phone matches exactly one", async () => {
      mocks.patientFindMany.mockResolvedValue([{ id: "p-existing", patientId: "LAB-2026-00001" }]);

      const res = await approveBooking(input);

      expect(res).toMatchObject({ createdNewPatient: false, patientId: "p-existing" });
      expect(mocks.txPatientCreate).not.toHaveBeenCalled();
    });

    // Households share a phone. Guessing would attach one person's results to
    // another's record, so the staff are asked instead.
    it("asks which household member when the phone matches several", async () => {
      mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

      const res = await approveBooking(input);

      expect(res.kind).toBe("chooser");
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("uses the household member the staff picked", async () => {
      mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

      const res = await approveBooking({ ...input, chosenPatientId: "p2" });

      expect(res).toMatchObject({ kind: "approved", patientId: "p2" });
    });

    // A patient id that is not on this phone is someone else's record.
    it("rejects a chosen patient who is not on this phone", async () => {
      mocks.patientFindMany.mockResolvedValue([{ id: "p1" }]);
      await expect(approveBooking({ ...input, chosenPatientId: "outsider" })).rejects.toThrow(
        "INVALID_INPUT",
      );
    });

    it("creates a fresh patient when the staff say this is a new person on a shared phone", async () => {
      mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

      const res = await approveBooking({ ...input, chosenPatientId: "__new__" });

      expect(res).toMatchObject({ kind: "approved", createdNewPatient: true });
      expect(mocks.txPatientCreate).toHaveBeenCalledOnce();
    });
  });

  it("bills the visit for the tests that were booked", async () => {
    await approveBooking(input);

    const data = mocks.txVisitCreate.mock.calls[0]![0].data;
    expect(data.invoice.create).toMatchObject({
      subtotal: 500,
      total: 500,
      paymentStatus: "Pending",
      amountPaid: 0,
    });
    expect(data.type).toBe("HomeCollection");
    expect(data.visitId).toBe("VIS-2026-00042");
  });

  it("gives the patient an access code for the portal", async () => {
    const res = await approveBooking(input);

    expect(res).toMatchObject({ accessCode: "K9XF2A" });
    const data = mocks.txVisitCreate.mock.calls[0]![0].data;
    expect(data.accessCodeHash).toBe("hashed");
  });

  it("records the phlebotomist on the home visit", async () => {
    await approveBooking(input);
    expect(mocks.txHomeVisitCreate.mock.calls[0]![0].data).toMatchObject({
      assignedToId: "phleb-1",
      visitId: "v-new",
      status: "Booked",
    });
  });

  // Without this the booking would be approved again on the next look, creating
  // a second visit for the same request.
  it("points the booking at the visit it produced", async () => {
    await approveBooking(input);
    expect(mocks.txBookingUpdate.mock.calls[0]![0].data).toMatchObject({
      status: "Approved",
      resultingVisitId: "v-new",
      resultingPatientId: "p-new",
    });
  });

  // The status is re-read inside the transaction because another staff member
  // may have approved the same booking between the first read and the write.
  it("refuses when the booking was approved by someone else mid-flight", async () => {
    mocks.txBookingFindUnique.mockResolvedValue(booking({ status: "Approved" }));
    await expect(approveBooking(input)).rejects.toThrow("INVALID_STATE");
  });
});

/**
 * Approving in the staff portal only marked the booking Approved and assigned a
 * phlebotomist. Everything that makes the approval mean something lived behind
 * the desktop's Approve button and ran nowhere else, so a home collection
 * approved from a phone produced no visit to collect against and no bill, while
 * the patient was told their booking was accepted.
 */
describe("convertApprovedBooking", () => {
  beforeEach(() => {
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());
  });

  it("creates the visit, its invoice and the home visit", async () => {
    const res = await convertApprovedBooking("b1");

    expect(res).toMatchObject({ kind: "converted", visitId: "v-new", patientId: "p-new" });
    const data = mocks.txVisitCreate.mock.calls[0]![0].data;
    expect(data.type).toBe("HomeCollection");
    expect(data.invoice.create).toMatchObject({ subtotal: 500, total: 500, amountPaid: 0 });
    expect(mocks.txHomeVisitCreate).toHaveBeenCalledOnce();
  });

  it("keeps the phlebotomist and approver the portal recorded", async () => {
    await convertApprovedBooking("b1");

    expect(mocks.txHomeVisitCreate.mock.calls[0]![0].data.assignedToId).toBe("phleb-2");
    expect(mocks.txBookingUpdate.mock.calls[0]![0].data.approvedByUserId).toBe("admin-1");
  });

  it("reuses the patient when the phone matches exactly one", async () => {
    mocks.patientFindMany.mockResolvedValue([{ id: "p-existing" }]);

    const res = await convertApprovedBooking("b1");

    expect(res).toMatchObject({ patientId: "p-existing" });
    expect(mocks.txPatientCreate).not.toHaveBeenCalled();
  });

  // Guessing would file one household member's results under another's record.
  it("leaves a shared phone for a human to resolve", async () => {
    mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    expect(await convertApprovedBooking("b1")).toEqual({
      kind: "skipped",
      reason: "ambiguous_patient",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  // Converting twice would give one request two visits, two invoices, two bills.
  it("does nothing for a booking that already produced a visit", async () => {
    mocks.bookingFindUnique.mockResolvedValue(portalApproved({ resultingVisitId: "v-old" }));

    expect(await convertApprovedBooking("b1")).toEqual({
      kind: "skipped",
      reason: "already_converted",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does nothing for a booking that is still pending", async () => {
    mocks.bookingFindUnique.mockResolvedValue(booking({ status: "Pending" }));
    expect(await convertApprovedBooking("b1")).toEqual({ kind: "skipped", reason: "not_approved" });
  });

  // The guard is re-checked inside the transaction, so a desktop approval racing
  // the sweep cannot produce a second visit.
  it("refuses when the booking gained a visit mid-flight", async () => {
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved({ resultingVisitId: "v-race" }));
    await expect(convertApprovedBooking("b1")).rejects.toThrow("ALREADY_CONVERTED");
  });
});

describe("convertPendingApprovedBookings", () => {
  // Driven off local state, not the sync cursor: a conversion that fails must be
  // retried, and by then the cursor has moved past the approval.
  it("looks for approvals that produced no visit", async () => {
    await convertPendingApprovedBookings();
    expect(mocks.bookingFindMany.mock.calls[0]![0].where).toEqual({
      status: "Approved",
      resultingVisitId: null,
    });
  });

  it("converts each one it finds", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());

    expect(await convertPendingApprovedBookings()).toMatchObject({ converted: 2, failed: 0 });
  });

  it("keeps going when one conversion fails, and reports it", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txVisitCreate.mockRejectedValueOnce(new Error("db busy"));

    expect(await convertPendingApprovedBookings()).toMatchObject({ converted: 1, failed: 1 });
  });

  it("counts a shared phone as skipped rather than failed", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    expect(await convertPendingApprovedBookings()).toMatchObject({ skipped: 1, failed: 0 });
  });
});
