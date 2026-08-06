import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

/**
 * A booking approved in the staff portal is converted into a Patient, Visit and
 * Invoice here, on a different machine, in a step that can fail on its own —
 * and nothing rolls the approval back when it does. The patient has already been
 * told their collection is confirmed.
 *
 * Until now that failure went nowhere. The sweep counted it and dropped the
 * error; this module logged the counts to `logger`, which writes to a console
 * that does not exist in the packaged app the lab actually runs. So the owner's
 * only symptom was a booking marked Approved with no patient behind it, and
 * there was no record anywhere of why.
 */

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  deadLetterFindMany: vi.fn(),
  deadLetterUpdate: vi.fn(),
  bookingFindUnique: vi.fn(),
  bookingUpsert: vi.fn(),
  convertPendingApprovedBookings: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: {
      findUnique: mocks.deadLetterFindUnique,
      upsert: mocks.deadLetterUpsert,
      findMany: mocks.deadLetterFindMany,
      update: mocks.deadLetterUpdate,
    },
    booking: { findUnique: mocks.bookingFindUnique, upsert: mocks.bookingUpsert },
  }),
}));

vi.mock("@main/services/bookings.service", () => ({
  convertPendingApprovedBookings: mocks.convertPendingApprovedBookings,
}));

vi.mock("@main/services/logger", () => ({ logError: mocks.logError }));

vi.mock("@main/services/notifications/triggers", () => ({
  bookingCreatedStaff: vi.fn().mockResolvedValue(undefined),
  bookingDeclined: vi.fn().mockResolvedValue(undefined),
  bookingApproved: vi.fn().mockResolvedValue(undefined),
  visitBooked: vi.fn().mockResolvedValue(undefined),
}));

import { pullBookings } from "../pull-bookings";

/** A sweep that did nothing at all — the common case. */
function quietSweep(over: Record<string, unknown> = {}) {
  return {
    converted: 0,
    skipped: 0,
    failed: 0,
    convertedItems: [],
    failures: [],
    skippedItems: [],
    ...over,
  };
}

/** Every logError call flattened to one searchable string. */
function loggedText(): string {
  return mocks.logError.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindMany.mockResolvedValue([]);
  mocks.bookingFindUnique.mockResolvedValue(null);
  mocks.convertPendingApprovedBookings.mockResolvedValue(quietSweep());
});

/** A booking row as the cloud returns it. */
function cloudBooking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    booking_id: "BKG-2026-00001",
    patient_phone: "9876543210",
    patient_name: "Sujata Mahato",
    patient_email: null,
    address: "Golmuri",
    pincode: "831003",
    test_ids: JSON.stringify(["t1"]),
    preferred_date: "2026-08-10T00:00:00Z",
    preferred_slot: "Morning",
    notes: null,
    status: "Approved",
    decline_reason: null,
    approved_by_user_id: "admin-1",
    approved_at: "2026-08-05T10:00:00Z",
    assigned_to_user_id: null,
    resulting_visit_id: null,
    resulting_patient_id: null,
    version: 1,
    source_ip: null,
    captcha_passed: true,
    created_at: "2026-08-05T09:00:00Z",
    updated_at: "2026-08-05T10:00:00Z",
    ...over,
  };
}

/**
 * The confirmation call is now recorded in the staff portal too, not only at the
 * desktop. It has to survive the trip back down: the whole point of storing it
 * is that months later someone can ask whether anybody ever rang this number,
 * and the desktop holds the master copy that question gets asked of.
 */
describe("pullBookings — the confirmation call", () => {
  it("brings the recorded call outcome down to the desktop", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        cloudBooking({
          phone_confirm_outcome: "Reached",
          phone_confirmed_at: "2026-08-05T09:55:00Z",
          phone_confirmed_by_id: "admin-1",
        }),
      ]),
    });

    await pullBookings(cloud);

    const arg = mocks.bookingUpsert.mock.calls[0]![0];
    expect(arg.create.phoneConfirmOutcome).toBe("Reached");
    expect(arg.create.phoneConfirmedById).toBe("admin-1");
    expect(arg.update.phoneConfirmOutcome).toBe("Reached");
  });

  // Null means "never asked", and it has to stay distinguishable from
  // "asked, nobody answered".
  it("leaves the outcome null for a booking where nobody was asked", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([cloudBooking()]),
    });

    await pullBookings(cloud);

    const arg = mocks.bookingUpsert.mock.calls[0]![0];
    expect(arg.create.phoneConfirmOutcome).toBeNull();
    expect(arg.create.phoneConfirmedAt).toBeNull();
  });
});

describe("pullBookings — reporting conversions that did not happen", () => {
  it("writes a failed conversion to the error log, naming the booking and the reason", async () => {
    mocks.convertPendingApprovedBookings.mockResolvedValue(
      quietSweep({
        failed: 1,
        failures: [
          {
            bookingId: "BKG-2026-00007",
            error: "Foreign key constraint violated on visit_tests.test_id",
          },
        ],
      }),
    );

    await pullBookings(makeFakeCloudClient());

    const text = loggedText();
    expect(text).toContain("BKG-2026-00007");
    expect(text).toContain("visit_tests.test_id");
  });

  // Nothing in the system can finish these: the sweep will not guess which
  // household member the booking is for, and the desktop's Approve button
  // refuses anything no longer Pending. They need to be findable by a human.
  it("writes a booking that needs a human to the error log, with the reason", async () => {
    mocks.convertPendingApprovedBookings.mockResolvedValue(
      quietSweep({
        skipped: 1,
        skippedItems: [{ bookingId: "BKG-2026-00008", reason: "ambiguous_patient" }],
      }),
    );

    await pullBookings(makeFakeCloudClient());

    const text = loggedText();
    expect(text).toContain("BKG-2026-00008");
    expect(text).toContain("ambiguous_patient");
  });

  // A booking whose visit simply has not synced yet resolves itself on a later
  // tick. Logging it every five seconds would bury the ones that matter.
  it("stays silent about a booking that was already converted", async () => {
    mocks.convertPendingApprovedBookings.mockResolvedValue(
      quietSweep({
        skipped: 1,
        skippedItems: [{ bookingId: "BKG-2026-00009", reason: "already_converted" }],
      }),
    );

    await pullBookings(makeFakeCloudClient());

    expect(loggedText()).not.toContain("BKG-2026-00009");
  });

  it("stays silent when every conversion succeeded", async () => {
    mocks.convertPendingApprovedBookings.mockResolvedValue(
      quietSweep({ converted: 1, convertedItems: [{ bookingId: "b1", visitId: "v1" }] }),
    );

    await pullBookings(makeFakeCloudClient());

    expect(mocks.logError).not.toHaveBeenCalled();
  });

  // The sweep runs after the page of rows is applied. If it throws, the failure
  // has to reach the log too rather than vanishing into the existing catch.
  it("writes the error to the log when the sweep itself throws", async () => {
    mocks.convertPendingApprovedBookings.mockRejectedValue(new Error("database is locked"));

    await pullBookings(makeFakeCloudClient());

    expect(loggedText()).toContain("database is locked");
  });
});
