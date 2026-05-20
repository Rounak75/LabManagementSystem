import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  paymentReceived: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    invoice: { findUnique: mocks.findUnique, update: mocks.update },
  }),
}));
vi.mock("@main/services/audit.service", () => ({ audit: mocks.audit }));
vi.mock("@main/services/notifications/triggers", () => ({
  paymentReceived: mocks.paymentReceived,
}));

import { recordUpiPayment } from "../upi.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paymentReceived.mockResolvedValue(undefined);
});

describe("recordUpiPayment", () => {
  it("marks an unpaid invoice as Paid with method=UPI and full amount", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "inv-1",
      total: "350.00",
      amountPaid: "0",
      paymentStatus: "Pending",
    });
    mocks.update.mockResolvedValue({ id: "inv-1", paymentStatus: "Paid" });

    const r = await recordUpiPayment("inv-1");

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { amountPaid: 350, paymentStatus: "Paid", paymentMethod: "UPI" },
    });
    expect(mocks.audit).toHaveBeenCalledWith("PAYMENT", "Invoice", "inv-1");
    expect(mocks.paymentReceived).toHaveBeenCalledWith("inv-1");
    expect(r.paymentStatus).toBe("Paid");
  });

  it("is idempotent: returns existing invoice without writing if already Paid", async () => {
    const already = {
      id: "inv-2",
      total: "100.00",
      amountPaid: "100.00",
      paymentStatus: "Paid",
    };
    mocks.findUnique.mockResolvedValue(already);

    const r = await recordUpiPayment("inv-2");

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.paymentReceived).not.toHaveBeenCalled();
    expect(r).toBe(already);
  });

  it("throws NOT_FOUND when the invoice does not exist", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(recordUpiPayment("missing")).rejects.toThrow("NOT_FOUND");
  });

  it("converts a Partial invoice to Paid (UPI is full-amount)", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "inv-3",
      total: "500.00",
      amountPaid: "200.00",
      paymentStatus: "Partial",
    });
    mocks.update.mockResolvedValue({ id: "inv-3", paymentStatus: "Paid" });

    await recordUpiPayment("inv-3");

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "inv-3" },
      data: { amountPaid: 500, paymentStatus: "Paid", paymentMethod: "UPI" },
    });
  });

  it("does not crash if notification trigger throws", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "inv-4",
      total: "100.00",
      amountPaid: "0",
      paymentStatus: "Pending",
    });
    mocks.update.mockResolvedValue({ id: "inv-4", paymentStatus: "Paid" });
    mocks.paymentReceived.mockRejectedValueOnce(new Error("sms api down"));

    const r = await recordUpiPayment("inv-4");
    expect(r.paymentStatus).toBe("Paid");
  });
});
