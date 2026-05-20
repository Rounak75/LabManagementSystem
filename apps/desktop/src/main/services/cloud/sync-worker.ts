import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";
import { dequeueBatch, markSent, scheduleRetry, pruneSent } from "./outbox.service";
import { pullPaymentEvents } from "./payment-events";
import { pullBookings } from "./pull-bookings";
import { pullDisputes } from "./pull-disputes";
import { pullPatients } from "./pull-patients";
import { pullVisits } from "./pull-visits";
import { pullResults } from "./pull-results";
import { pullPayments } from "./pull-payments";
import { pullVerifications } from "./pull-verifications";
import { pullPrintJobs } from "./pull-print-jobs";

const TICK_MS = 10_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

interface OutboxRow {
  id: string;
  tableName: string;
  operation: "create" | "update" | "delete";
  rowId: string;
  payload: string;
  attempts: number;
}

function compact(rows: OutboxRow[]): { toPush: OutboxRow[]; allIds: string[] } {
  const lastByKey = new Map<string, OutboxRow>();
  for (const r of rows) {
    const key = `${r.tableName}|${r.rowId}`;
    if (r.operation === "delete") {
      lastByKey.set(key, r);
    } else {
      const prev = lastByKey.get(key);
      if (!prev || prev.operation !== "delete") {
        lastByKey.set(key, r);
      }
    }
  }
  return { toPush: Array.from(lastByKey.values()), allIds: rows.map((r) => r.id) };
}

async function loadClient() {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.cloudSyncEnabled) return null;
  if (!s.supabaseUrl || !s.supabaseServiceKey || !s.supabaseAnonKey) return null;
  return createSupabaseClient({
    url: s.supabaseUrl,
    serviceKey: decryptSecret(s.supabaseServiceKey),
    anonKey: s.supabaseAnonKey,
  });
}

export async function runSyncTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const client = await loadClient();
    if (!client) return;
    const rows = (await dequeueBatch()) as OutboxRow[];
    if (rows.length === 0) {
      await pruneSent();
      return;
    }
    const { toPush, allIds } = compact(rows);
    const pushedKeys = new Set<string>();
    for (const row of toPush) {
      try {
        await client.pushRow({
          tableName: row.tableName,
          operation: row.operation,
          rowId: row.rowId,
          payload: row.operation === "delete" ? null : JSON.parse(row.payload),
        });
        pushedKeys.add(row.id);
      } catch (e) {
        await scheduleRetry(row, e as Error);
      }
    }
    for (const id of allIds) {
      const r = rows.find((x) => x.id === id)!;
      const key = `${r.tableName}|${r.rowId}`;
      const target = toPush.find((x) => `${x.tableName}|${x.rowId}` === key);
      if (target && pushedKeys.has(target.id)) {
        await markSent(id);
      }
    }
    await pruneSent();
  } finally {
    running = false;
  }
}

// Phase 3d Plan A: push a heartbeat row on every tick so the patient portal
// can show "data may be out of date" when the desktop is offline.
async function tickHeartbeat(): Promise<void> {
  const client = await loadClient();
  if (!client) return;
  await client.pushHeartbeat();
}

export function startCloudSyncWorker(): void {
  if (timer) return;
  timer = setInterval(async () => {
    try { await runSyncTick(); } catch (e) { console.error("[cloud] sync tick", e); }
    try { await pullPaymentEvents(); } catch (e) { console.error("[cloud] pull tick", e); }
    try { await pullBookings(); } catch (e) { console.error("[cloud] pull-bookings tick", e); }
    try { await pullDisputes(); } catch (e) { console.error("[cloud] pull-disputes tick", e); }
    // Phase 3e Plan A: admin-portal pull modules. Order matters — patients
    // before visits before results, so FK references resolve.
    try { await pullPatients(); } catch (e) { console.error("[cloud] pull-patients", e); }
    try { await pullVisits(); } catch (e) { console.error("[cloud] pull-visits", e); }
    try { await pullResults(); } catch (e) { console.error("[cloud] pull-results", e); }
    try { await pullPayments(); } catch (e) { console.error("[cloud] pull-payments", e); }
    try { await pullVerifications(); } catch (e) { console.error("[cloud] pull-verifications", e); }
    try { await pullPrintJobs(); } catch (e) { console.error("[cloud] pull-print-jobs", e); }
    try { await tickHeartbeat(); } catch (e) { console.error("[cloud] heartbeat tick", e); }
  }, TICK_MS);
}

export function stopCloudSyncWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
