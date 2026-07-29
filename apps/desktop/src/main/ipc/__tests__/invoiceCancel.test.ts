import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Cancelling an invoice raised in error.
 *
 * The app never had this. The unlock guard told the owner to "cancel the invoice
 * first", an action that existed nowhere, so the instruction could not be
 * followed. Unlocking no longer depends on it, but a bill raised for the wrong
 * patient or the wrong tests still needs a way to be withdrawn.
 */

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => "." } }));

const mocks = vi.hoisted(() => ({
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    invoice: { findUnique: mocks.invoiceFindUnique, update: mocks.invoiceUpdate },
    auditLog: { create: mocks.auditLogCreate },
  }),
}));
vi.mock("@main/services/audit.service", () => ({ audit: mocks.audit }));
vi.mock("@main/services/notifications/triggers", () => ({ paymentReceived: vi.fn() }));
vi.mock("@main/services/payments/upi.service", () => ({ recordUpiPayment: vi.fn() }));

import { cancelInvoice } from "../invoices.ipc";
import { setSession } from "@main/session";

const REASON = "raised against the wrong patient";

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ id: "admin-1", username: "admin", name: "Admin User", role: "Admin" });
  mocks.invoiceFindUnique.mockResolvedValue({
    id: "inv1",
    amountPaid: 0,
    paymentStatus: "Pending",
  });
  mocks.invoiceUpdate.mockResolvedValue({ paymentStatus: "Cancelled" });
  mocks.audit.mockResolvedValue(undefined);
});

describe("invoices:cancel", () => {
  // Withdrawing a bill is the owner's call, not the front desk's.
  it("refuses a non-Admin", async () => {
    setSession({ id: "staff-1", username: "staff", name: "Staff One", role: "Staff" });
    await expect(cancelInvoice({ invoiceId: "inv1", reason: REASON })).rejects.toThrow();
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
  });

  it("requires a reason worth reading", async () => {
    await expect(cancelInvoice({ invoiceId: "inv1", reason: "oops" })).rejects.toThrow(
      "REASON_REQUIRED",
    );
    await expect(cancelInvoice({ invoiceId: "inv1", reason: "          " })).rejects.toThrow(
      "REASON_REQUIRED",
    );
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
  });

  it("refuses an invoice that does not exist", async () => {
    mocks.invoiceFindUnique.mockResolvedValue(null);
    await expect(cancelInvoice({ invoiceId: "nope", reason: REASON })).rejects.toThrow("NOT_FOUND");
  });

  it("refuses one that is already cancelled", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      amountPaid: 0,
      paymentStatus: "Cancelled",
    });
    await expect(cancelInvoice({ invoiceId: "inv1", reason: REASON })).rejects.toThrow(
      "ALREADY_CANCELLED",
    );
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
  });

  // Marked, not deleted: the record of what was billed has to survive.
  it("marks the invoice Cancelled rather than removing it", async () => {
    const res = await cancelInvoice({ invoiceId: "inv1", reason: REASON });

    expect(res).toEqual({ paymentStatus: "Cancelled" });
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { paymentStatus: "Cancelled" },
    });
  });

  // Money already taken is not unwound by cancelling the bill. The refund is a
  // physical act someone has to perform, and the audit row is what makes the
  // two reconcilable later.
  it("records what had been paid, so a refund can be reconciled", async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: "inv1",
      amountPaid: 300,
      paymentStatus: "Partial",
    });

    await cancelInvoice({ invoiceId: "inv1", reason: REASON });

    const [action, entity, entityId, details, actor] = mocks.audit.mock.calls[0]!;
    expect(action).toBe("INVOICE_CANCELLED");
    expect(entity).toBe("Invoice");
    expect(entityId).toBe("inv1");
    expect(actor).toBe("admin-1");
    const parsed = JSON.parse(details as string);
    expect(parsed).toMatchObject({
      reason: REASON,
      amountPaidAtCancellation: 300,
      previousStatus: "Partial",
    });
  });

  it("caps an over-long reason rather than rejecting the cancellation", async () => {
    await cancelInvoice({ invoiceId: "inv1", reason: "x".repeat(900) });
    const parsed = JSON.parse(mocks.audit.mock.calls[0]![3] as string);
    expect(parsed.reason).toHaveLength(500);
  });
});
