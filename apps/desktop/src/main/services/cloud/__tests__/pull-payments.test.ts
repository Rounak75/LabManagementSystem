import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  fetchPaymentsSince: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    invoice: { findUnique: mocks.invoiceFindUnique, update: mocks.invoiceUpdate },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: (s: string) => s }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({ fetchPaymentsSince: mocks.fetchPaymentsSince }),
}));

import { pullPayments } from "../pull-payments";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u",
    supabaseAnonKey: "a",
    supabaseServiceKey: "s",
  });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
});

describe("pullPayments", () => {
  it("applies an admin-source payment, marks invoice Paid when fully covered", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 500,
      amountPaid: 0,
      paymentMethod: null,
    });
    mocks.fetchPaymentsSince.mockResolvedValue([
      {
        id: "pay1",
        invoice_id: "inv1",
        amount: 500,
        method: "UPI",
        reference: null,
        source: "admin",
        received_by_user_id: "u1",
        received_at: "2026-05-20T13:00:00Z",
        created_at: "2026-05-20T13:00:00Z",
        updated_at: "2026-05-20T13:00:00Z",
      },
    ]);
    await pullPayments();
    expect(mocks.invoiceUpdate).toHaveBeenCalledOnce();
    const arg = mocks.invoiceUpdate.mock.calls[0]![0];
    expect(arg.data.amountPaid).toBe(500);
    expect(arg.data.paymentStatus).toBe("Paid");
    expect(arg.data.paymentMethod).toBe("UPI");
  });

  it("sets paymentStatus=Partial when amount < total", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv2",
      total: 500,
      amountPaid: 0,
      paymentMethod: null,
    });
    mocks.fetchPaymentsSince.mockResolvedValue([
      {
        id: "pay2",
        invoice_id: "inv2",
        amount: 200,
        method: "Cash",
        source: "admin",
        created_at: "2026-05-20T13:00:00Z",
        updated_at: "2026-05-20T13:00:00Z",
      },
    ]);
    await pullPayments();
    expect(mocks.invoiceUpdate.mock.calls[0]![0].data.paymentStatus).toBe("Partial");
  });

  it("skips desktop-source rows", async () => {
    mocks.fetchPaymentsSince.mockResolvedValue([
      {
        id: "pay3",
        invoice_id: "inv3",
        amount: 100,
        source: "desktop",
        created_at: "2026-05-20T13:00:00Z",
        updated_at: "2026-05-20T13:00:00Z",
      },
    ]);
    await pullPayments();
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    // Still advances cursor
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("skips when local invoice is missing (out-of-order arrival)", async () => {
    mocks.invoiceFindUnique.mockResolvedValue(null);
    mocks.fetchPaymentsSince.mockResolvedValue([
      {
        id: "pay4",
        invoice_id: "inv-missing",
        amount: 100,
        source: "admin",
        created_at: "2026-05-20T13:00:00Z",
        updated_at: "2026-05-20T13:00:00Z",
      },
    ]);
    await pullPayments();
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
  });
});
