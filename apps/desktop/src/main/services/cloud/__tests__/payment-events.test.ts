import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  markPaid: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
  }),
}));
vi.mock("@main/services/payments/reconcile", () => ({ markPaid: mocks.markPaid }));

import { pullPaymentEvents } from "../payment-events";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
});

describe("pullPaymentEvents", () => {
  it("applies payment.captured events via markPaid", async () => {
    const cloud = makeFakeCloudClient({
      fetchUnprocessedPaymentEvents: vi.fn().mockResolvedValue([
        {
          event_id: "evt_1",
          event: "payment.captured",
          razorpay_payload: {
            payload: {
              payment: { entity: { id: "pay_X", amount: 50000, notes: { invoiceId: "inv-1" } } },
            },
          },
          received_at: "2026-05-18T10:00:00Z",
          processed_at: null,
        },
      ]),
    });

    await pullPaymentEvents(cloud);

    // Razorpay reports paise; the invoice is in rupees.
    expect(mocks.markPaid).toHaveBeenCalledWith("inv-1", "pay_X", 500, "Razorpay");
    expect(cloud.markPaymentEventProcessed).toHaveBeenCalledWith("evt_1");
  });

  it("applies payment_link.paid events via reference_id", async () => {
    const cloud = makeFakeCloudClient({
      fetchUnprocessedPaymentEvents: vi.fn().mockResolvedValue([
        {
          event_id: "evt_2",
          event: "payment_link.paid",
          razorpay_payload: {
            payload: {
              payment_link: { entity: { reference_id: "inv-2" } },
              payment: { entity: { id: "pay_Y", amount: 25000 } },
            },
          },
          received_at: "2026-05-18T10:01:00Z",
          processed_at: null,
        },
      ]),
    });

    await pullPaymentEvents(cloud);

    expect(mocks.markPaid).toHaveBeenCalledWith("inv-2", "pay_Y", 250, "Razorpay");
  });

  it("ignores other event types but marks processed", async () => {
    const cloud = makeFakeCloudClient({
      fetchUnprocessedPaymentEvents: vi.fn().mockResolvedValue([
        {
          event_id: "evt_3",
          event: "payment.failed",
          razorpay_payload: { payload: {} },
          received_at: "2026-05-18T10:02:00Z",
          processed_at: null,
        },
      ]),
    });

    await pullPaymentEvents(cloud);

    expect(mocks.markPaid).not.toHaveBeenCalled();
    expect(cloud.markPaymentEventProcessed).toHaveBeenCalledWith("evt_3");
  });

  it("advances cursor to last received_at", async () => {
    const cloud = makeFakeCloudClient({
      fetchUnprocessedPaymentEvents: vi.fn().mockResolvedValue([
        {
          event_id: "evt_a",
          event: "payment.failed",
          razorpay_payload: { payload: {} },
          received_at: "2026-05-18T10:00:00Z",
          processed_at: null,
        },
        {
          event_id: "evt_b",
          event: "payment.failed",
          razorpay_payload: { payload: {} },
          received_at: "2026-05-18T10:01:00Z",
          processed_at: null,
        },
      ]),
    });

    await pullPaymentEvents(cloud);

    expect(mocks.syncCursorUpsert).toHaveBeenCalledWith({
      where: { source: "razorpay_payments" },
      update: { lastSyncedAt: new Date("2026-05-18T10:01:00Z") },
      create: {
        source: "razorpay_payments",
        lastSyncedAt: new Date("2026-05-18T10:01:00Z"),
      },
    });
  });

  it("does not write a cursor when there are no unprocessed events", async () => {
    const cloud = makeFakeCloudClient();
    await pullPaymentEvents(cloud);
    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });

  it("keeps processing later events when one event fails", async () => {
    mocks.markPaid.mockRejectedValueOnce(new Error("invoice gone"));
    const cloud = makeFakeCloudClient({
      fetchUnprocessedPaymentEvents: vi.fn().mockResolvedValue([
        {
          event_id: "evt_bad",
          event: "payment.captured",
          razorpay_payload: {
            payload: { payment: { entity: { id: "p1", amount: 100, notes: { invoiceId: "gone" } } } },
          },
          received_at: "2026-05-18T10:00:00Z",
          processed_at: null,
        },
        {
          event_id: "evt_good",
          event: "payment.failed",
          razorpay_payload: { payload: {} },
          received_at: "2026-05-18T10:01:00Z",
          processed_at: null,
        },
      ]),
    });

    await pullPaymentEvents(cloud);

    expect(cloud.markPaymentEventProcessed).toHaveBeenCalledWith("evt_good");
  });
});
