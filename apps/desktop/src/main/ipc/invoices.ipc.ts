import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession, requireAdmin } from "@main/session";
import { audit } from "@main/services/audit.service";
import * as triggers from "@main/services/notifications/triggers";
import { recordUpiPayment } from "@main/services/payments/upi.service";
import type { DiscountInput } from "@shared/api";
import { domainError } from "@shared/domain-error";

register("invoices:get", async ({ id }: { id: string }) => {
  requireSession();
  const inv = await prisma().invoice.findUnique({
    where: { id },
    include: { visit: { include: { patient: true, visitTests: { include: { test: true } } } } }
  });
  if (!inv) throw domainError("NOT_FOUND");
  return inv;
});

/**
 * Cancels an invoice raised in error.
 *
 * The app has never had this. The unlock guard told the owner to "cancel the
 * invoice first", an action that existed nowhere, so the instruction could not
 * be followed. Unlocking no longer depends on it, but a bill raised for the
 * wrong patient or the wrong tests still needs a way to be withdrawn, and
 * deleting it would take the record of what happened with it.
 *
 * The invoice is kept and marked Cancelled, with the reason and who decided it.
 * Money already recorded against it is left in place rather than silently
 * unwound: if a patient really paid, that fact is not undone by cancelling the
 * bill, and the refund is a physical act someone has to perform and record.
 * The audit row is what makes the pair reconcilable later.
 */
export async function cancelInvoice({
  invoiceId,
  reason,
}: {
  invoiceId: string;
  reason: string;
}): Promise<{ paymentStatus: string }> {
  const u = requireAdmin();
  if (reason.trim().length < 10) throw domainError("REASON_REQUIRED");

  const inv = await prisma().invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw domainError("NOT_FOUND");
  if (inv.paymentStatus === "Cancelled") throw domainError("ALREADY_CANCELLED");

  const updated = await prisma().invoice.update({
    where: { id: invoiceId },
    data: { paymentStatus: "Cancelled" },
  });

  await audit(
    "INVOICE_CANCELLED",
    "Invoice",
    invoiceId,
    JSON.stringify({
      reason: reason.trim().slice(0, 500),
      // Recorded because it is the number that has to be refunded by hand, and
      // it stops being visible on the invoice once it is cancelled.
      amountPaidAtCancellation: Number(inv.amountPaid),
      previousStatus: inv.paymentStatus,
    }),
    u.id,
  );

  return { paymentStatus: updated.paymentStatus };
}

register("invoices:cancel", cancelInvoice);

register("invoices:applyDiscount", async (input: DiscountInput) => {
  requireAdmin();
  const inv = await prisma().invoice.findUnique({ where: { id: input.invoiceId } });
  if (!inv) throw domainError("NOT_FOUND");
  const subtotal = Number(inv.subtotal);
  const discount = input.isPercent ? Math.round(subtotal * input.amount) / 100 : input.amount;
  if (discount < 0 || discount > subtotal) throw domainError("INVALID_INPUT");
  const total = subtotal - discount;
  const updated = await prisma().invoice.update({
    where: { id: input.invoiceId }, data: { discountAmount: discount, total }
  });
  await audit("APPLY_DISCOUNT", "Invoice", input.invoiceId);
  return updated;
});

register("invoices:recordCash", async ({ invoiceId, amount }: { invoiceId: string; amount: number }) => {
  requireSession();
  const inv = await prisma().invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw domainError("NOT_FOUND");
  const newPaid = Number(inv.amountPaid) + amount;
  const total = Number(inv.total);
  let status: "Pending" | "Partial" | "Paid" = "Pending";
  if (newPaid >= total)      status = "Paid";
  else if (newPaid > 0)      status = "Partial";
  const updated = await prisma().invoice.update({
    where: { id: invoiceId }, data: { amountPaid: newPaid, paymentStatus: status, paymentMethod: "Cash" }
  });
  await audit("PAYMENT", "Invoice", invoiceId);
  if (status === "Paid" && inv.paymentStatus !== "Paid") {
    triggers.paymentReceived(invoiceId).catch(err =>
      console.error("[notifications] paymentReceived trigger failed", err));
  }
  return updated;
});

register("invoices:recordUpi", async ({ invoiceId }: { invoiceId: string }) => {
  requireSession();
  return recordUpiPayment(invoiceId);
});
