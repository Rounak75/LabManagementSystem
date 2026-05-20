import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  decryptSecret: vi.fn((s: string) => s.replace("enc:", "")),
  fetchUnprocessed: vi.fn(),
  markProcessed: vi.fn(),
  markPaid: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({
    fetchUnprocessedPaymentEvents: mocks.fetchUnprocessed,
    markPaymentEventProcessed: mocks.markProcessed,
  }),
}));
vi.mock("@main/services/payments/reconcile", () => ({ markPaid: mocks.markPaid }));

import { pullPaymentEvents } from "../payment-events";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u", supabaseAnonKey: "a", supabaseServiceKey: "enc:s",
  });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
});

describe("pullPaymentEvents", () => {
  it("applies payment.captured events via markPaid", async () => {
    mocks.fetchUnprocessed.mockResolvedValue([
      {
        event_id: "evt_1",
        event: "payment.captured",
        razorpay_payload: {
          payload: { payment: { entity: { id: "pay_X", amount: 50000, notes: { invoiceId: "inv-1" } } } },
        },
        received_at: "2026-05-18T10:00:00Z",
        processed_at: null,
      },
    ]);
    await pullPaymentEvents();
    expect(mocks.markPaid).toHaveBeenCalledWith("inv-1", "pay_X", 500, "Razorpay");
    expect(mocks.markProcessed).toHaveBeenCalledWith("evt_1");
  });

  it("applies payment_link.paid events via reference_id", async () => {
    mocks.fetchUnprocessed.mockResolvedValue([
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
    ]);
    await pullPaymentEvents();
    expect(mocks.markPaid).toHaveBeenCalledWith("inv-2", "pay_Y", 250, "Razorpay");
  });

  it("ignores other event types but marks processed", async () => {
    mocks.fetchUnprocessed.mockResolvedValue([
      { event_id: "evt_3", event: "payment.failed", razorpay_payload: { payload: {} }, received_at: "2026-05-18T10:02:00Z", processed_at: null },
    ]);
    await pullPaymentEvents();
    expect(mocks.markPaid).not.toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith("evt_3");
  });

  it("advances cursor to last received_at", async () => {
    mocks.fetchUnprocessed.mockResolvedValue([
      { event_id: "evt_a", event: "payment.failed", razorpay_payload: { payload: {} }, received_at: "2026-05-18T10:00:00Z", processed_at: null },
      { event_id: "evt_b", event: "payment.failed", razorpay_payload: { payload: {} }, received_at: "2026-05-18T10:01:00Z", processed_at: null },
    ]);
    await pullPaymentEvents();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledWith({
      where: { source: "razorpay_payments" },
      update: { lastSyncedAt: new Date("2026-05-18T10:01:00Z") },
      create: { source: "razorpay_payments", lastSyncedAt: new Date("2026-05-18T10:01:00Z") },
    });
  });

  it("no-op when sync disabled", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false });
    await pullPaymentEvents();
    expect(mocks.fetchUnprocessed).not.toHaveBeenCalled();
  });
});
