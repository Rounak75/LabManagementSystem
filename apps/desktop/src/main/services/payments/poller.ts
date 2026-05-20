// apps/desktop/src/main/services/payments/poller.ts
import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createRazorpayClient, type RazorpayClient } from "./razorpay-client";
import { markPaid } from "./reconcile";

const TICK_MS = 30_000;
const MAX_FAILS = 3;

let timer: NodeJS.Timeout | null = null;
let running = false;
const fails = new Map<string, number>();
const inflight = new Set<string>();

async function getClient(): Promise<RazorpayClient | null> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s || s.razorpayMode === "Off" || !s.razorpayKeyId || !s.razorpayKeySecret) return null;
  return createRazorpayClient({ keyId: s.razorpayKeyId, keySecret: decryptSecret(s.razorpayKeySecret) });
}

async function dueRows(invoiceIds?: string[]) {
  const where: Record<string, unknown> = {
    paymentStatus: { not: "Paid" },
    OR: [{ razorpayPaymentLinkId: { not: null } }, { razorpayQrId: { not: null } }],
    paymentLinkStatus: { notIn: ["Expired", "Cancelled", "PollFailed", "Paid"] },
  };
  if (invoiceIds) where.id = { in: invoiceIds };
  return prisma().invoice.findMany({ where });
}

async function pollRow(
  client: RazorpayClient,
  row: {
    id: string;
    razorpayPaymentLinkId: string | null;
    razorpayQrId: string | null;
    total: { toString(): string };
  }
) {
  if (inflight.has(row.id)) return;
  inflight.add(row.id);
  try {
    if (row.razorpayPaymentLinkId) {
      const res = await client.fetchPaymentLink(row.razorpayPaymentLinkId);
      if (res.status === "paid") {
        const payment = (res.payments as Array<{ payment_id: string; amount: number }> | null)?.[0];
        const amount = payment ? payment.amount / 100 : Number(row.total.toString());
        await markPaid(row.id, payment?.payment_id ?? "unknown", amount, "Razorpay");
      } else if (res.status === "expired") {
        await prisma().invoice.update({ where: { id: row.id }, data: { paymentLinkStatus: "Expired" } });
      } else if (res.status === "cancelled") {
        await prisma().invoice.update({ where: { id: row.id }, data: { paymentLinkStatus: "Cancelled" } });
      }
    } else if (row.razorpayQrId) {
      const res = await client.fetchQr(row.razorpayQrId);
      const qr = res as typeof res & { payments_amount_received: number };
      if (res.status === "closed" && qr.payments_amount_received > 0) {
        const amount = qr.payments_amount_received / 100;
        await markPaid(row.id, "qr_payment", amount, "Razorpay");
      } else if (res.status === "closed") {
        await prisma().invoice.update({ where: { id: row.id }, data: { paymentLinkStatus: "Cancelled" } });
      }
    }
    fails.delete(row.id);
  } catch (e) {
    const n = (fails.get(row.id) ?? 0) + 1;
    fails.set(row.id, n);
    if (n >= MAX_FAILS) {
      await prisma().invoice.update({ where: { id: row.id }, data: { paymentLinkStatus: "PollFailed" } });
      fails.delete(row.id);
    }
    console.error(`[poller] row ${row.id} failed (${n}/${MAX_FAILS})`, e);
  } finally {
    inflight.delete(row.id);
  }
}

export async function runPollTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const client = await getClient();
    if (!client) return;
    const rows = await dueRows();
    for (const row of rows) {
      await pollRow(client, row);
    }
  } finally {
    running = false;
  }
}

export async function pollOne(invoiceId: string): Promise<void> {
  const client = await getClient();
  if (!client) throw new Error("RAZORPAY_DISABLED");
  const rows = await dueRows([invoiceId]);
  for (const row of rows) {
    await pollRow(client, row);
  }
}

export function startPaymentsPoller(): void {
  if (timer) return;
  timer = setInterval(() => {
    runPollTick().catch((e) => console.error("[poller] tick failed", e));
  }, TICK_MS);
}

export function stopPaymentsPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
