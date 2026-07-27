// Phase 3e Plan A — pull admin-portal-recorded payments and reconcile into the
// local Invoice. The local schema has no Payment table (Phase 1 design), so each
// pulled row bumps Invoice.amountPaid and recomputes paymentStatus. Idempotency
// is explicit: the invoice update and the ProcessedCloudPayment marker are
// written in one transaction, so a crash between them cannot double-apply.

import { prisma } from "@main/db";
import { logger } from "./logger";
import { runPull } from "./pull-runner";
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

export async function pullPayments(client: CloudClient): Promise<void> {
  await runPull<RawPaymentRow>(client, {
    source: SOURCE,
    table: "payments",
    cursorColumn: "updated_at",
    shouldApply: (r) => r.source === "admin",

    applyRow: async (r) => {
      const invoice = await prisma().invoice.findUnique({ where: { id: r.invoice_id } });
      if (!invoice) {
        // The invoice may simply not have synced yet. Skipping (rather than
        // failing) keeps a permanently-missing invoice from wedging the stream.
        logger.warn(
          "cloud",
          `[pull-payments] no local invoice for payment ${r.id} invoice ${JSON.stringify(r.invoice_id)}`,
        );
        return;
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
    },
  });
}
