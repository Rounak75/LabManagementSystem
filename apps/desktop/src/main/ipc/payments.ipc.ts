import { register } from "@main/ipc";
import { requireAdmin, requireSession } from "@main/session";
import { createLinkForInvoice } from "@main/services/payments/link.service";
import { createQrForInvoice, cancelQrForInvoice } from "@main/services/payments/qr.service";
import { pollOne } from "@main/services/payments/poller";
import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createRazorpayClient } from "@main/services/payments/razorpay-client";

// ─── payments:createLink ──────────────────────────────────────────────────────

register("payments:createLink", async ({ invoiceId }: { invoiceId: string }) => {
  requireSession();
  return createLinkForInvoice(invoiceId);
});

// ─── payments:createQr ───────────────────────────────────────────────────────

register("payments:createQr", async ({ invoiceId }: { invoiceId: string }) => {
  requireSession();
  return createQrForInvoice(invoiceId);
});

// ─── payments:cancelQr ───────────────────────────────────────────────────────

register("payments:cancelQr", async ({ invoiceId }: { invoiceId: string }) => {
  requireSession();
  return cancelQrForInvoice(invoiceId);
});

// ─── payments:checkNow ───────────────────────────────────────────────────────

register("payments:checkNow", async ({ invoiceId }: { invoiceId: string }) => {
  requireSession();
  return pollOne(invoiceId);
});

// ─── payments:testConnection ──────────────────────────────────────────────────

register("payments:testConnection", async () => {
  requireAdmin();

  const settings = await prisma().labSettings.findUnique({ where: { id: "singleton" } });

  if (
    !settings?.razorpayKeyId ||
    !settings?.razorpayKeySecret
  ) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }

  const keySecret = decryptSecret(settings.razorpayKeySecret);
  const client = createRazorpayClient({
    keyId: settings.razorpayKeyId,
    keySecret,
  });

  await client.testConnection();

  return { ok: true, mode: settings.razorpayMode };
});
