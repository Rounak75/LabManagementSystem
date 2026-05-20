import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession, requireAdmin } from "@main/session";
import { audit } from "@main/services/audit.service";
import * as triggers from "@main/services/notifications/triggers";
import { recordUpiPayment } from "@main/services/payments/upi.service";
import type { DiscountInput } from "@shared/api";

register("invoices:get", async ({ id }: { id: string }) => {
  requireSession();
  const inv = await prisma().invoice.findUnique({
    where: { id },
    include: { visit: { include: { patient: true, visitTests: { include: { test: true } } } } }
  });
  if (!inv) throw new Error("NOT_FOUND");
  return inv;
});

register("invoices:applyDiscount", async (input: DiscountInput) => {
  requireAdmin();
  const inv = await prisma().invoice.findUnique({ where: { id: input.invoiceId } });
  if (!inv) throw new Error("NOT_FOUND");
  const subtotal = Number(inv.subtotal);
  const discount = input.isPercent ? Math.round(subtotal * input.amount) / 100 : input.amount;
  if (discount < 0 || discount > subtotal) throw new Error("INVALID_INPUT");
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
  if (!inv) throw new Error("NOT_FOUND");
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
