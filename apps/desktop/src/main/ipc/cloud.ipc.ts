import { register } from "@main/ipc";
import { requireAdmin, requireSession } from "@main/session";
import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "@main/services/cloud/supabase-client";
import { runBackfillOnce } from "@main/services/cloud/backfill.service";
import { runSyncTick, getLastTickHealth } from "@main/services/cloud/sync-worker";
import { syncEngine } from "@main/services/cloud/sync-engine";
import { domainError } from "@shared/domain-error";

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

  // Health used to be derived purely from outbox (push) state, so a pull that
  // was failing — or wedged on one bad row — showed as "healthy" while results
  // stopped arriving from the lab. Report the pull side too.
  const stuckRowCount = await prisma().syncDeadLetter.count({ where: { resolvedAt: null } });
  const tick = getLastTickHealth();

  return {
    enabled: s?.cloudSyncEnabled ?? false,
    lastPushAt: lastSent?.sentAt ?? null,
    pendingCount,
    failedCount,
    sentCount,
    backfillCompletedAt: s?.backfillCompletedAt ?? null,
    freeTierBytes,
    freeTierLimit: 500 * 1024 * 1024,
    // Pull-side health.
    stuckRowCount,
    lastTickAt: tick?.at ?? null,
    lastTickErrors: tick?.errors ?? [],
    cloudUnreachable: tick?.unreachable ?? false,
  };
});

register("cloud:testConnection", async () => {
  requireAdmin();
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.supabaseUrl || !s.supabaseAnonKey || !s.supabaseServiceKey) {
    throw domainError("CLOUD_NOT_CONFIGURED");
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

register("cloud:checkNow", async () => {
  requireSession();

  const client = await syncEngine.loadClient();
  if (!client) return { ok: false, error: "Cloud sync not configured" };

  // runSyncTick pushes the outbox and then runs every registered pull handler
  // in dependency order, via syncEngine.runPulls.
  //
  // This handler used to call it and then run its own hand-sorted list of the
  // same nine handlers, so pressing "check now" ran two complete pull passes.
  // The second pass found nothing — the cursors had already moved — but still
  // cost a cloud round-trip per handler, and the list had to be re-sorted by
  // hand whenever a dependency changed. It also missed the heartbeat handler,
  // so a manual check told the portal nothing about the desktop being awake.
  const tick = await runSyncTick();

  return {
    ok: tick.errors.length === 0,
    stats: { pushed: tick.pushed, pulled: tick.pulled, errors: tick.errors },
  };
});
