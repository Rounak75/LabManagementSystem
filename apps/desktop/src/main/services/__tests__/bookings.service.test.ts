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
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  transaction: vi.fn(),
  txBookingFindUnique: vi.fn(),
  txPatientCreate: vi.fn(),
  txTestFindMany: vi.fn(),
  txVisitCreate: vi.fn(),
  txHomeVisitCreate: vi.fn(),
  txBookingUpdate: vi.fn(),
  nextPatientId: vi.fn(),
  nextVisitId: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    booking: { findUnique: mocks.bookingFindUnique, findMany: mocks.bookingFindMany },
    patient: { findMany: mocks.patientFindMany },
    user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
    $transaction: mocks.transaction,
  }),
}));
vi.mock("../id-generator", () => ({
  nextPatientId: mocks.nextPatientId,
  nextVisitId: mocks.nextVisitId,
}));

import {
  approveBooking,
  convertApprovedBooking,
  convertPendingApprovedBookings,
  listUnconvertedApprovals,
  resolveApprovedBooking,
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

const input = {
  bookingId: "b1",
  staffUserId: "staff-1",
  assignedToUserId: "phleb-1",
  phoneConfirmOutcome: "Reached" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bookingFindUnique.mockResolvedValue(booking());
  mocks.txBookingFindUnique.mockResolvedValue(booking());
  mocks.patientFindMany.mockResolvedValue([]);
  mocks.nextPatientId.mockResolvedValue("LAB-2026-00042");
  mocks.nextVisitId.mockResolvedValue("VIS-2026-00042");
  mocks.txPatientCreate.mockResolvedValue({ id: "p-new" });
  mocks.txTestFindMany.mockResolvedValue([
    { id: "t1", price: 300 },
    { id: "t2", price: 200 },
  ]);
  mocks.txVisitCreate.mockResolvedValue({ id: "v-new" });
  mocks.txHomeVisitCreate.mockResolvedValue({});
  mocks.txBookingUpdate.mockResolvedValue({});
  mocks.bookingFindMany.mockResolvedValue([]);
  mocks.userFindUnique.mockResolvedValue({ id: "admin-1" });
  mocks.userFindFirst.mockResolvedValue({ id: "admin-fallback" });
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

  // The access code was retired: the booking id the patient already holds is
  // what signs them in, so approving no longer mints a second credential. The
  // columns are still on Visit, which is why this asserts nothing writes to
  // them rather than trusting that nothing does.
  it("mints no access code — the booking id is the credential", async () => {
    const res = await approveBooking(input);

    expect(res).not.toHaveProperty("accessCode");
    const data = mocks.txVisitCreate.mock.calls[0]![0].data;
    expect(data.accessCodeHash).toBeUndefined();
    expect(data.accessCodePlaintext).toBeUndefined();
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

describe("sweep results for the caller's notifications", () => {
  // bookingApproved and visitBooked fired only from the desktop's own Approve
  // button, so an approval made on a phone produced a visit nobody had told the
  // patient about. The puller sends them, and needs to know what was created.
  it("reports what each conversion produced", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());

    const swept = await convertPendingApprovedBookings();

    expect(swept.convertedItems).toEqual([{ bookingId: "b1", visitId: "v-new" }]);
  });

  it("reports nothing for a booking it could not convert", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const swept = await convertPendingApprovedBookings();

    expect(swept.convertedItems).toEqual([]);
  });
});

/**
 * A booking approved in the staff portal is converted here, on a different
 * machine, in a step that can fail on its own — and nothing rolls the approval
 * back when it does. The patient has been told their collection is confirmed.
 *
 * The sweep counted those failures and discarded the error, and the puller
 * logged only the counts. So a conversion that failed every tick for a week
 * produced no error text anywhere, and the only visible symptom was a booking
 * marked Approved with no patient behind it. Counting a failure is not the same
 * as being able to find out what it was.
 */
describe("what the sweep reports when it cannot convert", () => {
  it("records why a conversion failed, not just that it did", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txVisitCreate.mockRejectedValueOnce(
      new Error("Foreign key constraint failed: visit_tests.test_id"),
    );

    const swept = await convertPendingApprovedBookings();

    expect(swept.failures).toEqual([
      { bookingId: "b1", error: expect.stringContaining("visit_tests.test_id") },
    ]);
  });

  // Which household member a booking belongs to is a judgement only staff can
  // make, and the desktop's own Approve button refuses an already-Approved
  // booking — so nothing in the system can finish these. Naming them is what
  // makes them findable.
  it("names the bookings that need a human", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const swept = await convertPendingApprovedBookings();

    expect(swept.skippedItems).toEqual([{ bookingId: "b1", reason: "ambiguous_patient" }]);
  });

  it("reports no failures when every conversion succeeds", async () => {
    mocks.bookingFindMany.mockResolvedValue([{ id: "b1" }]);
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());

    const swept = await convertPendingApprovedBookings();

    expect(swept.failures).toEqual([]);
    expect(swept.skippedItems).toEqual([]);
  });
});

/**
 * The owner's view of the same problem.
 *
 * A booking stuck this way reads as "Approved" everywhere the patient and the
 * staff can see, so the only person who can notice it is the one looking for it
 * — and the Bookings screen defaults to the Pending filter, where it does not
 * appear at all. This is what the screen counts to say so out loud.
 */
/**
 * The booking carries test ids the *portal* chose, from the *cloud* catalogue.
 * The desktop's catalogue can be behind — reconciliation retires duplicates, and
 * the cloud only learns about it when the catalogue is pushed. A booking naming
 * a test this machine has never heard of used to reach `visitTests.create`
 * anyway, where the foreign key refused it and took the whole transaction with
 * it, silently, every tick.
 */
describe("a booking naming tests the local catalogue does not have", () => {
  beforeEach(() => {
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());
    // The booking asks for t1 and t2; only t1 is known here.
    mocks.txTestFindMany.mockResolvedValue([{ id: "t1", price: 300 }]);
  });

  it("refuses instead of failing on a foreign key deep inside the write", async () => {
    await expect(convertApprovedBooking("b1")).rejects.toThrow(/UNKNOWN_TESTS/);
  });

  it("names the tests it could not find, so the catalogue can be put right", async () => {
    await expect(convertApprovedBooking("b1")).rejects.toThrow(/t2/);
  });

  // Billing for only the tests that happen to be known would under-charge the
  // patient and print a report missing the test they asked for. Neither is
  // something to do quietly.
  it("creates no visit at all rather than one missing a test", async () => {
    await expect(convertApprovedBooking("b1")).rejects.toThrow();
    expect(mocks.txVisitCreate).not.toHaveBeenCalled();
  });

  it("applies the same rule to the desktop's own Approve button", async () => {
    mocks.bookingFindUnique.mockResolvedValue(booking());
    mocks.txBookingFindUnique.mockResolvedValue(booking());
    await expect(approveBooking(input)).rejects.toThrow(/UNKNOWN_TESTS/);
  });
});

/**
 * Who the conversion records as having created the patient and the visit.
 *
 * This was `booking.approvedByUserId ?? "system"`, and there is no user called
 * "system" — so a booking whose approver did not reach this machine failed the
 * foreign key on Patient.createdById and was retried for ever. Losing a
 * patient's booking over the question of which staff member approved it is the
 * wrong trade, the same one already settled for results in 309a97f.
 */
describe("who a portal approval is attributed to", () => {
  beforeEach(() => {
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());
  });

  it("uses the approver the portal recorded when this machine knows them", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "admin-1" });

    await convertApprovedBooking("b1");

    expect(mocks.txPatientCreate.mock.calls[0]![0].data.createdById).toBe("admin-1");
  });

  it("falls back to an admin when the approver never synced here", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    await convertApprovedBooking("b1");

    expect(mocks.txPatientCreate.mock.calls[0]![0].data.createdById).toBe("admin-fallback");
    expect(mocks.txVisitCreate.mock.calls[0]![0].data.staffId).toBe("admin-fallback");
  });

  it("falls back to an admin when the portal recorded no approver at all", async () => {
    mocks.bookingFindUnique.mockResolvedValue(portalApproved({ approvedByUserId: null }));
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved({ approvedByUserId: null }));

    await convertApprovedBooking("b1");

    expect(mocks.txPatientCreate.mock.calls[0]![0].data.createdById).toBe("admin-fallback");
  });

  // Better a named refusal that reaches the log than a foreign key error from
  // three calls deeper.
  it("refuses with a clear reason when there is no user to attribute it to", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(convertApprovedBooking("b1")).rejects.toThrow("NO_ATTRIBUTABLE_USER");
  });
});

/**
 * The shared-phone dead end.
 *
 * The sweep will not guess which household member a booking belongs to — right,
 * because guessing files one person's results under another's name. But the
 * desktop's Approve button refuses anything that is no longer Pending, so once
 * the portal had marked it Approved there was no way to answer the question
 * either. The booking sat there for good.
 */
describe("resolveApprovedBooking", () => {
  beforeEach(() => {
    mocks.bookingFindUnique.mockResolvedValue(portalApproved());
    mocks.txBookingFindUnique.mockResolvedValue(portalApproved());
    mocks.patientFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
  });

  it("converts using the household member the staff picked", async () => {
    const res = await resolveApprovedBooking({
      bookingId: "b1",
      staffUserId: "staff-1",
      chosenPatientId: "p2",
    });

    expect(res).toMatchObject({ kind: "converted", patientId: "p2", visitId: "v-new" });
    expect(mocks.txPatientCreate).not.toHaveBeenCalled();
  });

  it("creates a fresh patient when the staff say this is a new person", async () => {
    const res = await resolveApprovedBooking({
      bookingId: "b1",
      staffUserId: "staff-1",
      chosenPatientId: "__new__",
    });

    expect(res).toMatchObject({ kind: "converted", patientId: "p-new" });
    expect(mocks.txPatientCreate).toHaveBeenCalledOnce();
  });

  it("offers the candidates when the staff have not chosen yet", async () => {
    const res = await resolveApprovedBooking({ bookingId: "b1", staffUserId: "staff-1" });

    expect(res.kind).toBe("chooser");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  // Someone else's record is not a choice this booking can make.
  it("rejects a patient who is not on this booking's phone", async () => {
    await expect(
      resolveApprovedBooking({ bookingId: "b1", staffUserId: "staff-1", chosenPatientId: "outsider" }),
    ).rejects.toThrow("INVALID_INPUT");
  });

  it("refuses a booking that already produced a visit", async () => {
    mocks.bookingFindUnique.mockResolvedValue(portalApproved({ resultingVisitId: "v-old" }));

    await expect(
      resolveApprovedBooking({ bookingId: "b1", staffUserId: "staff-1", chosenPatientId: "p1" }),
    ).rejects.toThrow("ALREADY_CONVERTED");
  });

  it("refuses a booking that is not approved", async () => {
    mocks.bookingFindUnique.mockResolvedValue(booking({ status: "Pending" }));

    await expect(
      resolveApprovedBooking({ bookingId: "b1", staffUserId: "staff-1", chosenPatientId: "p1" }),
    ).rejects.toThrow("INVALID_STATE");
  });
});

describe("listUnconvertedApprovals", () => {
  it("finds approvals that never produced a visit", async () => {
    await listUnconvertedApprovals();

    expect(mocks.bookingFindMany.mock.calls[0]![0].where).toEqual({
      status: "Approved",
      resultingVisitId: null,
    });
  });

  // Oldest first: the one that has been broken longest is the one the patient
  // has been waiting on, and it is the one worth showing at the top.
  it("puts the longest-stuck booking first", async () => {
    await listUnconvertedApprovals();
    expect(mocks.bookingFindMany.mock.calls[0]![0].orderBy).toEqual({ approvedAt: "asc" });
  });

  it("returns what the screen needs to identify each one", async () => {
    mocks.bookingFindMany.mockResolvedValue([
      {
        id: "b1",
        bookingId: "BKG-2026-00007",
        patientName: "Sujata Mahato",
        patientPhone: "9876543210",
        approvedAt: new Date("2026-08-01T10:00:00Z"),
      },
    ]);

    expect(await listUnconvertedApprovals()).toEqual([
      {
        id: "b1",
        bookingId: "BKG-2026-00007",
        patientName: "Sujata Mahato",
        patientPhone: "9876543210",
        approvedAt: new Date("2026-08-01T10:00:00Z"),
      },
    ]);
  });
});
