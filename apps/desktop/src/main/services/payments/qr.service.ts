import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createRazorpayClient, toPaise } from "./razorpay-client";
import { assertWithinDailyCap } from "./daily-cap";
import type { CreateQrResult } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Errors ───────────────────────────────────────────────────────────────────

export class RazorpayDisabledError extends Error {
  constructor() {
    super("RAZORPAY_DISABLED");
    this.name = "RazorpayDisabledError";
  }
}

export class InvoiceNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "InvoiceNotFoundError";
  }
}

export class AlreadyPaidError extends Error {
  constructor() {
    super("ALREADY_PAID");
    this.name = "AlreadyPaidError";
  }
}

export class NoOpenQrError extends Error {
  constructor() {
    super("NO_OPEN_QR");
    this.name = "NoOpenQrError";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loadClientFromSettings() {
  const settings = await prisma().labSettings.findUnique({
    where: { id: "singleton" },
  });

  const mode = settings?.razorpayMode ?? "Off";
  const keyId = settings?.razorpayKeyId ?? null;
  const keySecretEncrypted = settings?.razorpayKeySecret ?? null;

  if (mode === "Off" || !keyId || !keySecretEncrypted) {
    throw new RazorpayDisabledError();
  }

  const keySecret = decryptSecret(keySecretEncrypted);
  return createRazorpayClient({ keyId, keySecret });
}

// ─── createQrForInvoice ───────────────────────────────────────────────────────

/**
 * Creates a Razorpay QR code for the given invoiceId.
 *
 * - Validates that Razorpay is enabled (mode != Off, keys present)
 * - Validates that the invoice exists and is not already paid
 * - Checks daily cap before creating a new QR code
 * - Persists razorpayQrId, razorpayQrImageUrl, paymentLinkExpiresAt,
 *   and paymentLinkStatus: "Created" to the invoice
 */
export async function createQrForInvoice(
  invoiceId: string
): Promise<CreateQrResult> {
  // 1. Load settings and validate Razorpay is enabled
  const client = await loadClientFromSettings();

  // 2. Load invoice with visit info
  const invoice = await prisma().invoice.findUnique({
    where: { id: invoiceId },
    include: {
      visit: true,
    },
  });

  if (!invoice) {
    throw new InvoiceNotFoundError();
  }

  if (invoice.paymentStatus === "Paid") {
    throw new AlreadyPaidError();
  }

  // 3. Check daily cap
  await assertWithinDailyCap();

  // 4. Create the QR code
  const closeByEpoch = Math.floor((Date.now() + EXPIRY_MS) / 1000);

  const created = await client.createQr({
    amountPaise: toPaise(Number(invoice.total)),
    description: `Visit ${invoice.visit.id}`,
    closeByEpoch,
    notes: { invoiceId },
  });

  const expiresAt = new Date(created.closeBy * 1000);

  // 5. Persist the new QR to the invoice
  await prisma().invoice.update({
    where: { id: invoiceId },
    data: {
      razorpayQrId: created.id,
      razorpayQrImageUrl: created.imageUrl,
      paymentLinkStatus: "Created",
      paymentLinkExpiresAt: expiresAt,
    },
  });

  return {
    id: created.id,
    imageUrl: created.imageUrl,
    expiresAt,
  };
}

// ─── cancelQrForInvoice ───────────────────────────────────────────────────────

/**
 * Cancels the open Razorpay QR code for the given invoiceId.
 *
 * - Validates that Razorpay is enabled (mode != Off, keys present)
 * - Validates that the invoice has an open QR code (razorpayQrId present)
 * - Calls closeQr on the Razorpay client
 * - Clears razorpayQrId, razorpayQrImageUrl and sets paymentLinkStatus:
 *   "Cancelled"
 */
export async function cancelQrForInvoice(invoiceId: string): Promise<void> {
  // 1. Load settings and validate Razorpay is enabled
  const client = await loadClientFromSettings();

  // 2. Load invoice
  const invoice = await prisma().invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice || !invoice.razorpayQrId) {
    throw new NoOpenQrError();
  }

  // 3. Close the QR on Razorpay
  await client.closeQr(invoice.razorpayQrId);

  // 4. Clear QR fields on the invoice
  await prisma().invoice.update({
    where: { id: invoiceId },
    data: {
      razorpayQrId: null,
      razorpayQrImageUrl: null,
      paymentLinkStatus: "Cancelled",
    },
  });
}
