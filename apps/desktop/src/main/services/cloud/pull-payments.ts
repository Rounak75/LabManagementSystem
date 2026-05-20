// Phase 3e Plan A — pull admin-portal-recorded payments and reconcile into
// the local Invoice. The local schema has no Payment table (Phase 1 design),
// so each pulled row bumps Invoice.amountPaid and recomputes paymentStatus.
// Idempotency comes from the sync cursor advancing past each row's updated_at;
// admin-portal payments are insert-only so we won't see the same row twice.

import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";

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

export async function pullPayments(): Promise<void> {
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

  let rows: RawPaymentRow[] = [];
  try {
    rows = (await client.fetchPaymentsSince(sinceIso, BATCH)) as unknown as RawPaymentRow[];
  } catch (e) {
    console.error("[pull-payments] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  for (const r of rows) {
    try {
      const rowUpdated = new Date(r.updated_at);
      if (rowUpdated > latest) latest = rowUpdated;

      if (r.source !== "admin") continue;

      const invoice = await prisma().invoice.findUnique({ where: { id: r.invoice_id } });
      if (!invoice) {
        console.warn("[pull-payments] no local invoice for payment", r.id, "invoice", r.invoice_id);
        continue;
      }

      const newAmountPaid = Number(invoice.amountPaid) + r.amount;
      const total = Number(invoice.total);
      let paymentStatus = "Pending";
      if (newAmountPaid >= total && total > 0) paymentStatus = "Paid";
      else if (newAmountPaid > 0) paymentStatus = "Partial";

      await prisma().invoice.update({
        where: { id: r.invoice_id },
        data: {
          amountPaid: newAmountPaid,
          paymentStatus,
          paymentMethod: invoice.paymentMethod ?? r.method ?? null,
        },
      });
    } catch (e) {
      console.error("[pull-payments] row", r.id, "failed", e);
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest },
    create: { source: SOURCE, lastSyncedAt: latest },
  });
}
