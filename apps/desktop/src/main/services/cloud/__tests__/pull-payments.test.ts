import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  processedFindUnique: vi.fn(),
  processedCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    invoice: { findUnique: mocks.invoiceFindUnique, update: mocks.invoiceUpdate },
    processedCloudPayment: { findUnique: mocks.processedFindUnique, create: mocks.processedCreate },
    $transaction: mocks.transaction,
  }),
}));

import { pullPayments } from "../pull-payments";

function paymentRow(over: Record<string, unknown> = {}) {
  return {
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
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.processedFindUnique.mockResolvedValue(null);
  mocks.transaction.mockResolvedValue([]);
});

describe("pullPayments", () => {
  it("applies an admin-source payment, marks invoice Paid when fully covered", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 500,
      amountPaid: 0,
      paymentMethod: null,
    });
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([paymentRow()]),
    });

    await pullPayments(cloud);

    expect(mocks.invoiceUpdate).toHaveBeenCalledOnce();
    const arg = mocks.invoiceUpdate.mock.calls[0]![0];
    expect(arg.data.amountPaid).toBe(500);
    expect(arg.data.paymentStatus).toBe("Paid");
    expect(arg.data.paymentMethod).toBe("UPI");
  });

  it("writes the invoice update and the idempotency marker in one transaction", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 500,
      amountPaid: 0,
      paymentMethod: null,
    });
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([paymentRow()]),
    });

    await pullPayments(cloud);

    // Both writes must be in the same $transaction call, or a crash between them
    // double-applies the payment on the next tick.
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.calls[0]![0]).toHaveLength(2);
    expect(mocks.processedCreate).toHaveBeenCalledWith({ data: { id: "pay1" } });
  });

  it("sets paymentStatus=Partial when amount < total", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv2",
      total: 500,
      amountPaid: 0,
      paymentMethod: null,
    });
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        paymentRow({ id: "pay2", invoice_id: "inv2", amount: 200, method: "Cash" }),
      ]),
    });

    await pullPayments(cloud);

    expect(mocks.invoiceUpdate.mock.calls[0]![0].data.paymentStatus).toBe("Partial");
  });

  it("does not re-apply a payment that was already processed", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 500,
      amountPaid: 500,
      paymentMethod: "UPI",
    });
    mocks.processedFindUnique.mockResolvedValue({ id: "pay1" });
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([paymentRow()]),
    });

    await pullPayments(cloud);

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("skips desktop-source rows", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([paymentRow({ id: "pay3", source: "desktop" })]),
    });

    await pullPayments(cloud);

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("skips when local invoice is missing (out-of-order arrival)", async () => {
    mocks.invoiceFindUnique.mockResolvedValue(null);
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        paymentRow({ id: "pay4", invoice_id: "inv-missing" }),
      ]),
    });

    await pullPayments(cloud);

    expect(mocks.transaction).not.toHaveBeenCalled();
    // Cursor still advances so a permanently-missing invoice can't wedge the pull.
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });
});
