import { logger } from "./logger";
import { prisma } from "@main/db";
import type { CloudClient } from "./sync-engine";
import { markPaid } from "@main/services/payments/reconcile";
import type { PaymentEventRow } from "./types";

const BATCH = 50;
const SOURCE = "razorpay_payments";

export async function pullPaymentEvents(client: CloudClient): Promise<void> {
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();

  const events = (await client.fetchUnprocessedPaymentEvents(sinceIso, BATCH)) as PaymentEventRow[];
  if (events.length === 0) return;

  // The cursor may only move over events that actually applied.
  //
  // It used to be set to the last event in the page no matter what happened.
  // A failure was logged and the loop moved on, so the event was left unprocessed
  // but the cursor had already passed its timestamp — and the fetch asks for
  // events after the cursor, so it was never looked at again. That is a captured
  // Razorpay payment silently never reaching the invoice: the patient has paid,
  // the lab's copy says they have not, and the only trace is one line in a log.
  //
  // Holding the cursor at the first failure cannot wedge the stream, because the
  // fetch also filters on unprocessed: anything that succeeds drops out of the
  // result set on its own, and later events in the page are still attempted.
  let latest: Date | null = null;
  let blocked = false;

  for (const evt of events) {
    try {
      if (evt.event === "payment.captured" || evt.event === "payment_link.paid") {
        const invoiceId =
          evt.razorpay_payload?.payload?.payment_link?.entity?.reference_id ??
          evt.razorpay_payload?.payload?.payment?.entity?.notes?.invoiceId;
        const paymentId = evt.razorpay_payload?.payload?.payment?.entity?.id ?? "unknown";
        const amountPaise = evt.razorpay_payload?.payload?.payment?.entity?.amount ?? 0;
        if (invoiceId) {
          await markPaid(invoiceId, paymentId, amountPaise / 100, "Razorpay");
        } else {
          // Nothing to attach the money to. Recorded loudly rather than quietly
          // marked processed, which would retire a real payment unapplied.
          logger.error(
            "cloud",
            `[cloud] payment-event ${evt.event_id} carries no invoice id — leaving unprocessed`,
          );
          blocked = true;
          continue;
        }
      }
      await client.markPaymentEventProcessed(evt.event_id);
      if (!blocked) latest = new Date(evt.received_at);
    } catch (e) {
      logger.error("cloud", `[cloud] payment-event ${evt.event_id} failed`, e);
      blocked = true;
    }
  }

  if (latest) {
    await prisma().syncCursor.upsert({
      where: { source: SOURCE },
      update: { lastSyncedAt: latest },
      create: { source: SOURCE, lastSyncedAt: latest },
    });
  }
}
