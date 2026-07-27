import { register } from "@main/ipc";
import { requireAdmin, requireSession } from "@main/session";
import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "@main/services/cloud/supabase-client";
import { runBackfillOnce } from "@main/services/cloud/backfill.service";
import { runSyncTick } from "@main/services/cloud/sync-worker";

register("cloud:getStatus", async () => {
  requireSession();
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  const pendingCount = await prisma().outbox.count({ where: { status: "Pending" } });
  const failedCount = await prisma().outbox.count({ where: { status: "Failed" } });
  const sentCount = await prisma().outbox.count({ where: { status: "Sent" } });
  const lastSent = await prisma().outbox.findFirst({
    where: { status: "Sent" },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });

  let freeTierBytes: number | null = null;
  if (s?.cloudSyncEnabled && s.supabaseUrl && s.supabaseServiceKey && s.supabaseAnonKey) {
    try {
      const client = createSupabaseClient({
        url: s.supabaseUrl,
        serviceKey: decryptSecret(s.supabaseServiceKey),
        anonKey: s.supabaseAnonKey,
      });
      const free = await client.fetchFreeTierStatus();
      freeTierBytes = (free as { db_size_bytes?: number } | null)?.db_size_bytes ?? null;
    } catch {
      freeTierBytes = null;
    }
  }

  return {
    enabled: s?.cloudSyncEnabled ?? false,
    lastPushAt: lastSent?.sentAt ?? null,
    pendingCount,
    failedCount,
    sentCount,
    backfillCompletedAt: s?.backfillCompletedAt ?? null,
    freeTierBytes,
    freeTierLimit: 500 * 1024 * 1024,
  };
});

register("cloud:testConnection", async () => {
  requireAdmin();
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.supabaseUrl || !s.supabaseAnonKey || !s.supabaseServiceKey) {
    throw new Error("CLOUD_NOT_CONFIGURED");
  }
  const client = createSupabaseClient({
    url: s.supabaseUrl,
    serviceKey: decryptSecret(s.supabaseServiceKey),
    anonKey: s.supabaseAnonKey,
  });
  const r = await client.testConnection();
  return { ok: true, latencyMs: r.latencyMs };
});

register("cloud:listOutbox", async (args: { status?: string; tableName?: string; limit?: number; offset?: number }) => {
  requireAdmin();
  const where: Record<string, unknown> = {};
  if (args.status) where.status = args.status;
  if (args.tableName) where.tableName = args.tableName;
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  const rows = await prisma().outbox.findMany({
    where, orderBy: { createdAt: "desc" },
    take: limit, skip: offset,
  });
  return rows;
});

register("cloud:retryOutbox", async ({ id }: { id: string }) => {
  requireAdmin();
  await prisma().outbox.update({
    where: { id },
    data: { status: "Pending", attempts: 0, nextAttemptAt: new Date(), error: null },
  });
  return { ok: true };
});

register("cloud:cancelOutbox", async ({ id }: { id: string }) => {
  requireAdmin();
  await prisma().outbox.update({
    where: { id },
    data: { status: "Cancelled" },
  });
  return { ok: true };
});

register("cloud:runBackfillNow", async () => {
  requireAdmin();
  // Manual button always forces a full re-run, even if backfillCompletedAt is set.
  const r = await runBackfillOnce(true);
  return { ok: true, skipped: r.skipped };
});

import { pullPaymentEvents } from "@main/services/cloud/payment-events";
import { pullBookings } from "@main/services/cloud/pull-bookings";
import { pullDisputes } from "@main/services/cloud/pull-disputes";
import { pullPatients } from "@main/services/cloud/pull-patients";
import { pullVisits } from "@main/services/cloud/pull-visits";
import { pullResults } from "@main/services/cloud/pull-results";
import { pullPayments } from "@main/services/cloud/pull-payments";
import { pullVerifications } from "@main/services/cloud/pull-verifications";
import { pullPrintJobs } from "@main/services/cloud/pull-print-jobs";
import { syncEngine } from "@main/services/cloud/sync-engine";

// ... existing code ...

register("cloud:checkNow", async () => {
  requireSession();
  
  // Create structured logging similar to the sync worker
  let stats = { pushed: 0, pulled: 0, errors: [] as string[] };
  const safeRun = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      stats.pulled++;
    } catch (e) {
      stats.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      console.error(`[cloud] manual ${name} failed`, e);
    }
  };

  try { await runSyncTick(); stats.pushed++; } catch (e) { stats.errors.push(`sync: ${e}`); }
  
  const client = await syncEngine.loadClient();
  if (!client) return { ok: false, error: "Cloud sync not configured" };

  await safeRun("pull-payment-events", () => pullPaymentEvents(client));
  await safeRun("pull-bookings", () => pullBookings(client));
  await safeRun("pull-disputes", () => pullDisputes(client));
  await safeRun("pull-patients", () => pullPatients(client));
  await safeRun("pull-visits", () => pullVisits(client));
  await safeRun("pull-results", () => pullResults(client));
  await safeRun("pull-payments", () => pullPayments(client));
  await safeRun("pull-verifications", () => pullVerifications(client));
  await safeRun("pull-print-jobs", () => pullPrintJobs(client));
  
  return { ok: true, stats };
});
