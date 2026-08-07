import { prisma } from "@main/db";

/**
 * Retention for the sync worker's per-tick telemetry.
 *
 * `SyncTickLog` takes a row on every tick — every 5s while data is moving, every
 * 60s once the lab goes idle — and until now nothing ever removed one. Nothing
 * reads the table either; it exists to be queried by hand when sync misbehaves.
 * So it grew without limit on the one machine holding the lab's master copy, and
 * every `VACUUM INTO` backup copied all of it, which makes the nightly backup and
 * its restore rehearsal steadily slower for telemetry nobody will ever read.
 *
 * The table already carries `@@index([createdAt])` — the index a sweep like this
 * needs — so the intent was there from the start; only the sweep was missing.
 *
 * Kept deliberately separate from `sync-worker.ts`: this needs nothing but the
 * database, and importing it from the worker would pull the whole sync graph
 * (registry, engine, every pull handler, the Supabase client) into any test that
 * wanted to exercise a date comparison.
 */

/** How much history is kept. Long enough to diagnose something noticed late. */
export const TICK_LOG_RETENTION_DAYS = 30;

/**
 * Lower bound between sweeps.
 *
 * Sweeping on every tick would add a second write transaction every 5s to the
 * master database in order to delete nothing, almost every time. Hourly is far
 * more often than a 30-day window needs.
 */
export const TICK_LOG_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether enough time has passed to sweep again.
 *
 * Pure, so the pacing can be checked without a database. A `lastPruneAtMs` of 0
 * means "never swept in this process", which is always due — the first tick after
 * launch is exactly when a long accumulation is most likely to be waiting.
 */
export function shouldPruneTickLog(lastPruneAtMs: number, nowMs: number): boolean {
  return nowMs - lastPruneAtMs >= TICK_LOG_PRUNE_INTERVAL_MS;
}

/** Deletes telemetry older than the retention window. Returns rows removed. */
export async function pruneTickLog(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TICK_LOG_RETENTION_DAYS * DAY_MS);
  const { count } = await prisma().syncTickLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
