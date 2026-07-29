import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  deadLetterFindMany: vi.fn(),
  syncCursorUpsert: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  processedFindUnique: vi.fn(),
  processedCreate: vi.fn(),
  transaction: vi.fn(),
  paymentReceived: vi.fn(),
}));

vi.mock("@main/services/notifications/triggers", () => ({
  paymentReceived: mocks.paymentReceived,
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: { findUnique: mocks.deadLetterFindUnique, upsert: mocks.deadLetterUpsert, findMany: mocks.deadLetterFindMany },
    invoice: { findUnique: mocks.invoiceFindUnique, update: mocks.invoiceUpdate },
    processedCloudPayment: { findUnique: mocks.processedFindUnique, create: mocks.processedCreate },
    $transaction: mocks.transaction,
  }),
}));

import { pullPayments } from "../pull-payments";
import { MAX_ROW_ATTEMPTS } from "../pull-runner";

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
  mocks.deadLetterFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindMany.mockResolvedValue([]);
  mocks.processedFindUnique.mockResolvedValue(null);
  mocks.transaction.mockResolvedValue([]);
  mocks.paymentReceived.mockResolvedValue(0);
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

  // Settling the bill releases the report email held back waiting for it. Every
  // other route to Paid fires this — the desktop invoice screen, UPI
  // mark-received, the Razorpay reconcile — but payments arriving on this path
  // did not, and this is the path every payment recorded in the staff portal
  // takes. A patient who had paid at the counter had their report held for money
  // the lab already had.
  it("releases the held report email once the bill is settled", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 500,
      amountPaid: 0,
      paymentMethod: null,
      paymentStatus: "Pending",
    });
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([paymentRow()]) });

    await pullPayments(cloud);

    expect(mocks.paymentReceived).toHaveBeenCalledWith("inv1");
  });

  it("does not fire on a part payment that leaves a balance", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 900,
      amountPaid: 0,
      paymentMethod: null,
      paymentStatus: "Pending",
    });
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([paymentRow()]) });

    await pullPayments(cloud);

    expect(mocks.paymentReceived).not.toHaveBeenCalled();
  });

  it("does not re-fire for an invoice that was already Paid", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 500,
      amountPaid: 500,
      paymentMethod: "UPI",
      paymentStatus: "Paid",
    });
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([paymentRow()]) });

    await pullPayments(cloud);

    expect(mocks.paymentReceived).not.toHaveBeenCalled();
  });

  // The payment is already committed; a notification failure must not undo it or
  // make the row retry and double-count the money.
  it("keeps the payment when the notification trigger throws", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      total: 500,
      amountPaid: 0,
      paymentMethod: null,
      paymentStatus: "Pending",
    });
    mocks.paymentReceived.mockRejectedValue(new Error("smtp down"));
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([paymentRow()]) });

    await pullPayments(cloud);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.deadLetterUpsert).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
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

  // A payment whose invoice has not arrived yet used to be counted as applied, so
  // the cursor moved past it and it was never looked at again: money the patient
  // handed over vanished from the lab PC and the invoice stayed unpaid forever.
  // It is now retried, because the invoice normally lands moments later on the
  // visits stream.
  it("holds the cursor and retries when the local invoice has not synced yet", async () => {
    mocks.invoiceFindUnique.mockResolvedValue(null);
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        paymentRow({ id: "pay4", invoice_id: "inv-missing" }),
      ]),
    });

    await pullPayments(cloud);

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deadLetterUpsert).toHaveBeenCalledOnce();
    // Cursor held, so the next tick re-fetches this payment rather than losing it.
    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });

  // Retrying must not become wedging: an invoice that never arrives has to stop
  // blocking every later payment. After the retry budget the row is quarantined
  // in SyncDeadLetter — visible and replayable — and the stream moves on.
  it("quarantines the payment once retries are exhausted, so the stream still moves", async () => {
    mocks.invoiceFindUnique.mockResolvedValue(null);
    mocks.deadLetterFindUnique.mockResolvedValue({ attempts: MAX_ROW_ATTEMPTS - 1 });
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        paymentRow({ id: "pay5", invoice_id: "inv-missing" }),
      ]),
    });

    await pullPayments(cloud);

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deadLetterUpsert).toHaveBeenCalledOnce();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });
});
