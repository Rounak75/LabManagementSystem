import { prisma } from "@main/db";
import { paymentReceived } from "@main/services/notifications/triggers";
import { audit } from "@main/services/audit-best-effort";

export async function markPaid(
  invoiceId: string,
  providerPaymentId: string,
  amountRupees: number,
  method: "Razorpay"
): Promise<void> {
  let didUpdate = false;

  await prisma().$transaction(async (tx: any) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.paymentStatus === "Paid") return;
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus: "Paid",
        amountPaid: inv.total,
        paymentMethod: "Online",
        paymentLinkStatus: "Paid",
      },
    });
    didUpdate = true;
  });

  if (!didUpdate) return;

  audit.try("PAYMENT_RECEIVED", {
    entityType: "Invoice",
    entityId: invoiceId,
    userId: null as any,
  });
  Promise.resolve(paymentReceived(invoiceId)).catch((e) => {
    console.error("[reconcile] paymentReceived failed", e);
  });
}
