// Phase 3e Plan A — pull admin-portal-recorded payments and reconcile into the
// local Invoice. The local schema has no Payment table (Phase 1 design), so each
// pulled row bumps Invoice.amountPaid and recomputes paymentStatus. Idempotency
// is explicit: the invoice update and the ProcessedCloudPayment marker are
// written in one transaction, so a crash between them cannot double-apply.

import { prisma } from "@main/db";
import { logger } from "./logger";
import { runPull, type PullStats } from "./pull-runner";
import * as triggers from "@main/services/notifications/triggers";
import type { CloudClient } from "./sync-engine";

const SOURCE = "payments";

interface RawPaymentRow extends Record<string, unknown> {
  id: string;
  invoice_id: string;
  amount: number; // rupees, not paise
  method: string | null;
  reference: string | null;
  source: string;
  received_by_user_id: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function pullPayments(client: CloudClient): Promise<PullStats> {
  return runPull<RawPaymentRow>(client, {
    source: SOURCE,
    table: "payments",
    cursorColumn: "updated_at",
    shouldApply: (r) => r.source === "admin",

    applyRow: async (r) => {
      const invoice = await prisma().invoice.findUnique({ where: { id: r.invoice_id } });
      if (!invoice) {
        // Throw rather than return. Returning counted the row as applied, so the
        // cursor moved past it and the payment was never looked at again — money
        // the patient handed over vanished from the lab PC silently, and the
        // invoice stayed unpaid forever. Throwing retries it for a few ticks (the
        // invoice usually arrives moments later on the visits stream) and then
        // quarantines it in SyncDeadLetter, where it is visible and replayable.
        logger.warn(
          "cloud",
          `[pull-payments] no local invoice for payment ${r.id} invoice ${JSON.stringify(r.invoice_id)} — will retry`,
        );
        throw new Error(`no local invoice ${r.invoice_id} for payment ${r.id}`);
      }

      const processed = await prisma().processedCloudPayment.findUnique({ where: { id: r.id } });
      if (processed) return;

      const newAmountPaid = Number(invoice.amountPaid) + r.amount;
      const total = Number(invoice.total);
      let paymentStatus = "Pending";
      if (newAmountPaid >= total && total > 0) paymentStatus = "Paid";
      else if (newAmountPaid > 0) paymentStatus = "Partial";

      await prisma().$transaction([
        prisma().invoice.update({
          where: { id: r.invoice_id },
          data: {
            amountPaid: newAmountPaid,
            paymentStatus,
            paymentMethod: invoice.paymentMethod ?? r.method ?? null,
          },
        }),
        prisma().processedCloudPayment.create({ data: { id: r.id } }),
      ]);

      // Settling the bill releases the report email that was held back waiting
      // for it. Every other way an invoice reaches Paid fires this — the desktop
      // invoice screen, the UPI mark-received, the Razorpay reconcile — but the
      // payments arriving here did not, and this is the path every payment
      // recorded in the staff portal takes. So a patient who paid at the counter
      // or through the portal had their report held for a payment the lab had
      // already received.
      //
      // Only on the transition, and never fatal: the payment is committed above,
      // and a notification failure must not undo it or make the row retry.
      if (paymentStatus === "Paid" && invoice.paymentStatus !== "Paid") {
        try {
          await triggers.paymentReceived(r.invoice_id);
        } catch (e) {
          logger.error("cloud", `[pull-payments] paymentReceived trigger failed for ${r.invoice_id}`, e);
        }
      }
    },
  });
}
