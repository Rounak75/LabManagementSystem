import { prisma } from "@main/db";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DAILY_CAP = 50;

// ─── DailyCapExceededError ────────────────────────────────────────────────────

export class DailyCapExceededError extends Error {
  constructor() {
    super("DAILY_CAP_EXCEEDED");
    this.name = "DailyCapExceededError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Date representing the start of today at UTC midnight (00:00:00.000 UTC). */
export function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

// ─── assertWithinDailyCap ─────────────────────────────────────────────────────

/**
 * Counts invoices that have a Razorpay payment link or QR code created/updated
 * today (UTC). Throws DailyCapExceededError if the count has reached or exceeded
 * DAILY_CAP (50).
 */
export async function assertWithinDailyCap(): Promise<void> {
  const count = await prisma().invoice.count({
    where: {
      OR: [
        { razorpayPaymentLinkId: { not: null } },
        { razorpayQrId: { not: null } },
      ],
      updatedAt: {
        gte: startOfTodayUTC(),
      },
    },
  });

  if (count >= DAILY_CAP) {
    throw new DailyCapExceededError();
  }
}
