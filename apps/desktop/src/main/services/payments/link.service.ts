import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createRazorpayClient } from "./razorpay-client";
import { assertWithinDailyCap } from "./daily-cap";
import type { CreateLinkResult } from "./types";

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

export class PatientPhoneMissingError extends Error {
  constructor() {
    super("PATIENT_PHONE_MISSING");
    this.name = "PatientPhoneMissingError";
  }
}

// ─── createLinkForInvoice ─────────────────────────────────────────────────────

/**
 * Creates a Razorpay Payment Link for the given invoiceId.
 *
 * - Validates that Razorpay is enabled (mode != Off, keys present)
 * - Validates that the invoice exists and is not already paid
 * - Validates that the patient has a phone number
 * - Idempotent: if an existing "created" link is found for this invoice,
 *   saves and returns it instead of creating a duplicate
 * - Checks daily cap before creating a new link
 */
export async function createLinkForInvoice(
  invoiceId: string
): Promise<CreateLinkResult> {
  // 1. Load settings and validate Razorpay is enabled
  const settings = await prisma().labSettings.findUnique({
    where: { id: "singleton" },
  });

  const mode = settings?.razorpayMode ?? "Off";
  const keyId = settings?.razorpayKeyId ?? null;
  const keySecretEncrypted = settings?.razorpayKeySecret ?? null;

  if (mode === "Off" || !keyId || !keySecretEncrypted) {
    throw new RazorpayDisabledError();
  }

  // 2. Load invoice with patient info
  const invoice = await prisma().invoice.findUnique({
    where: { id: invoiceId },
    include: {
      visit: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new InvoiceNotFoundError();
  }

  if (invoice.paymentStatus === "Paid") {
    throw new AlreadyPaidError();
  }

  const patient = invoice.visit.patient;
  if (!patient.phone) {
    throw new PatientPhoneMissingError();
  }

  // 3. Build Razorpay client
  const keySecret = decryptSecret(keySecretEncrypted);
  const client = createRazorpayClient({ keyId, keySecret });

  // 4. Idempotency check — look for an existing "created" link
  const existing = await client.findPaymentLinkByReference(invoiceId);
  if (existing && existing.status === "created") {
    const expiresAt = new Date(existing.expire_by * 1000);

    // Persist to invoice (update in case it wasn't saved before)
    await prisma().invoice.update({
      where: { id: invoiceId },
      data: {
        razorpayPaymentLinkId: existing.id,
        razorpayPaymentLinkShortUrl: existing.short_url,
        paymentLinkStatus: "Created",
        paymentLinkExpiresAt: expiresAt,
      },
    });

    return {
      id: existing.id,
      shortUrl: existing.short_url,
      expiresAt,
    };
  }

  // 5. Check daily cap before creating a new link
  await assertWithinDailyCap();

  // 6. Create the payment link
  const expireByEpoch = Math.floor((Date.now() + EXPIRY_MS) / 1000);

  const customer: { name: string; contact: string; email?: string } = {
    name: patient.name,
    contact: patient.phone,
  };
  if (patient.email) {
    customer.email = patient.email;
  }

  const created = await client.createPaymentLink({
    amountRupees: Number(invoice.total),
    currency: "INR",
    description: `Lab invoice ${invoiceId}`,
    referenceId: invoiceId,
    expireByEpoch,
    customer,
  });

  const expiresAt = new Date(created.expireBy * 1000);

  // 7. Persist the new link to the invoice
  await prisma().invoice.update({
    where: { id: invoiceId },
    data: {
      razorpayPaymentLinkId: created.id,
      razorpayPaymentLinkShortUrl: created.shortUrl,
      paymentLinkStatus: "Created",
      paymentLinkExpiresAt: expiresAt,
    },
  });

  return {
    id: created.id,
    shortUrl: created.shortUrl,
    expiresAt,
  };
}
