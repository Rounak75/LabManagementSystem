import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  paymentReceived: vi.fn(),
  auditTry: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    invoice: { findUnique: mocks.invoiceFindUnique, update: mocks.invoiceUpdate },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        invoice: { findUnique: mocks.invoiceFindUnique, update: mocks.invoiceUpdate },
      }),
  }),
}));
vi.mock("@main/services/notifications/triggers", () => ({
  paymentReceived: mocks.paymentReceived,
}));
vi.mock("@main/services/audit-best-effort", () => ({
  audit: { try: mocks.auditTry },
}));

import { markPaid } from "../reconcile";

describe("reconcile.markPaid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flips invoice to Paid + fires paymentReceived", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv-1",
      paymentStatus: "Pending",
      total: { toString: () => "500" },
    });
    mocks.invoiceUpdate.mockResolvedValue({});
    await markPaid("inv-1", "pay_X", 500, "Razorpay");
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({
          paymentStatus: "Paid",
          paymentMethod: "Online",
          paymentLinkStatus: "Paid",
        }),
      })
    );
    expect(mocks.paymentReceived).toHaveBeenCalledWith("inv-1");
    expect(mocks.auditTry).toHaveBeenCalled();
  });

  it("idempotent — no-op when already Paid", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv-1",
      paymentStatus: "Paid",
      total: { toString: () => "500" },
    });
    await markPaid("inv-1", "pay_X", 500, "Razorpay");
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    expect(mocks.paymentReceived).not.toHaveBeenCalled();
  });
});
