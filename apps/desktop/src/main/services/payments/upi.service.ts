import { prisma } from "@main/db";
import { audit } from "@main/services/audit.service";
import * as triggers from "@main/services/notifications/triggers";

export async function recordUpiPayment(invoiceId: string) {
  const inv = await prisma().invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new Error("NOT_FOUND");

  if (inv.paymentStatus === "Paid") {
    return inv;
  }

  const total = Number(inv.total);
  const updated = await prisma().invoice.update({
    where: { id: invoiceId },
    data: { amountPaid: total, paymentStatus: "Paid", paymentMethod: "UPI" },
  });

  await audit("PAYMENT", "Invoice", invoiceId);
  triggers.paymentReceived(invoiceId).catch((err) =>
    console.error("[notifications] paymentReceived trigger failed", err)
  );

  return updated;
}
