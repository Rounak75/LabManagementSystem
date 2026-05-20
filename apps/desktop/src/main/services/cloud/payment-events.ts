import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";
import { markPaid } from "@main/services/payments/reconcile";
import type { PaymentEventRow } from "./types";

const BATCH = 50;
const SOURCE = "razorpay_payments";

export async function pullPaymentEvents(): Promise<void> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.cloudSyncEnabled) return;
  if (!s.supabaseUrl || !s.supabaseAnonKey || !s.supabaseServiceKey) return;

  const client = createSupabaseClient({
    url: s.supabaseUrl,
    serviceKey: decryptSecret(s.supabaseServiceKey),
    anonKey: s.supabaseAnonKey,
  });

  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();

  const events = (await client.fetchUnprocessedPaymentEvents(sinceIso, BATCH)) as PaymentEventRow[];
  if (events.length === 0) return;

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
        }
      }
      await client.markPaymentEventProcessed(evt.event_id);
    } catch (e) {
      console.error(`[cloud] payment-event ${evt.event_id} failed`, e);
    }
  }

  const last = events[events.length - 1]!;
  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: new Date(last.received_at) },
    create: { source: SOURCE, lastSyncedAt: new Date(last.received_at) },
  });
}
