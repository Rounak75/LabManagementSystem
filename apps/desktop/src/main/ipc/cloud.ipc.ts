import { register } from "@main/ipc";
import { requireAdmin, requireSession } from "@main/session";
import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "@main/services/cloud/supabase-client";
import { runBackfillOnce } from "@main/services/cloud/backfill.service";
import { runSyncTick } from "@main/services/cloud/sync-worker";
import { pullPaymentEvents } from "@main/services/cloud/payment-events";

register("cloud:getStatus", async () => {
  requireSession();
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  const pendingCount = await prisma().outbox.count({ where: { status: "Pending" } });
  const failedCount = await prisma().outbox.count({ where: { status: "Failed" } });
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
  const r = await runBackfillOnce();
  return { ok: true, skipped: r.skipped };
});

register("cloud:checkNow", async () => {
  requireAdmin();
  await runSyncTick();
  await pullPaymentEvents();
  return { ok: true };
});
