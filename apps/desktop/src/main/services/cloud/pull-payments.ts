import { logger } from "./logger";
// Phase 3e Plan A — pull admin-portal-recorded payments and reconcile into
// the local Invoice. The local schema has no Payment table (Phase 1 design),
// so each pulled row bumps Invoice.amountPaid and recomputes paymentStatus.
// Idempotency comes from the sync cursor advancing past each row's updated_at;
// admin-portal payments are insert-only so we won't see the same row twice.

import { prisma } from "@main/db";

const SOURCE = "payments";
const BATCH = 100;

interface RawPaymentRow {
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

export async function pullPayments(client: any): Promise<void> {
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  let rows: RawPaymentRow[] = [];
  try {
    rows = (await client.pullSince("payments", "updated_at", sinceIso, BATCH, undefined, lastId)) as unknown as RawPaymentRow[];
  } catch (e) {
    logger.error("cloud", "[pull-payments] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;
  for (const r of rows) {
    try {
      if (r.source === "admin") {
        const invoice = await prisma().invoice.findUnique({ where: { id: r.invoice_id } });
        if (!invoice) {
          logger.warn("cloud", "[pull-payments] no local invoice for payment" + " " + r.id + " " + "invoice" + " " + JSON.stringify(r.invoice_id));
          latest = new Date(r.updated_at);
          latestId = r.id;
          continue;
        }

        // Idempotency check
        const processed = await prisma().processedCloudPayment.findUnique({ where: { id: r.id } });
        if (processed) {
          // Already applied this payment to the invoice.
          latest = new Date(r.updated_at);
          latestId = r.id;
          continue;
        }

        const newAmountPaid = Number(invoice.amountPaid) + r.amount;
        const total = Number(invoice.total);
        let paymentStatus = "Pending";
        if (newAmountPaid >= total && total > 0) paymentStatus = "Paid";
        else if (newAmountPaid > 0) paymentStatus = "Partial";

        latest = new Date(r.updated_at);
        latestId = r.id;

        // Atomically update invoice and mark payment as processed to guarantee idempotency
        await prisma().$transaction([
          prisma().invoice.update({
            where: { id: r.invoice_id },
            data: {
              amountPaid: newAmountPaid,
              paymentStatus,
              paymentMethod: invoice.paymentMethod ?? r.method ?? null,
            },
          }),
          prisma().processedCloudPayment.create({
            data: { id: r.id }
          })
        ]);
      } else {
        // Not admin source -> advance cursor
        latest = new Date(r.updated_at);
        latestId = r.id;
      }
    } catch (e: any) {
      if (e?.code === "P2002" || e?.code === "P2003") {
        logger.warn("cloud", "[pull-payments] skipping row" + " " + r.id + " " + "— constraint conflict:" + " " + JSON.stringify(e.meta));
        // Skipped constraint conflict -> advance cursor
        latest = new Date(r.updated_at);
        latestId = r.id;
        continue;
      }
      logger.error("cloud", "[pull-payments] row" + " " + r.id + " " + "failed", e);
      throw e;
    }
  }

  // Update cursor at the end of the batch
  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest, lastId: latestId },
    create: { source: SOURCE, lastSyncedAt: latest, lastId: latestId },
  });
}
