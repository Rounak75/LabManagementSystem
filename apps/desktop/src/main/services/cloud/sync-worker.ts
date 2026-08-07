import { dequeueBatch, markSent, scheduleRetry, pruneSent } from "./outbox.service";
import { syncEngine } from "./sync-engine";
import "./sync-registry";
import { logger } from "./logger";
import { pruneTickLog, shouldPruneTickLog } from "./tick-log";
import { prisma } from "@main/db";

/** Interval while data is moving. */
export const BASE_TICK_MS = 5_000;
/** Ceiling once the lab has been idle for a while. */
export const MAX_IDLE_TICK_MS = 60_000;
/** Ceiling while the cloud is unreachable. */
export const MAX_OFFLINE_TICK_MS = 300_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let currentDelayMs = BASE_TICK_MS;
/** When the telemetry retention sweep last ran. 0 = not yet this process. */
let lastTickLogPruneAt = 0;

export interface TickStats {
  /** Outbox rows successfully pushed. */
  pushed: number;
  /** Cloud rows successfully applied locally. */
  pulled: number;
  /** Rows that failed to push or apply this tick. */
  failed: number;
  errors: string[];
  /** True when the failures look like loss of connectivity rather than bad data. */
  unreachable: boolean;
}

/** Summary of the most recent tick, for the sync status UI. */
export interface TickHealth extends TickStats {
  at: Date;
  durationMs: number;
  nextDelayMs: number;
}

let lastTick: TickHealth | null = null;
export function getLastTickHealth(): TickHealth | null {
  return lastTick;
}

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

/**
 * Chooses the delay before the next tick.
 *
 * The tick used to fire every 5s unconditionally. With ~10 pull handlers that is
 * on the order of 170,000 Supabase requests a day — including all night, when the
 * lab is closed — against a free tier, and with no let-up at all while the cloud
 * was unreachable. Backing off when there is nothing to do (and further when we
 * cannot reach the cloud) cuts that dramatically, while any real activity drops
 * straight back to the responsive interval.
 */
export function nextDelayMs(opts: {
  idle: boolean;
  unreachable: boolean;
  previousDelayMs: number;
}): number {
  if (!opts.idle) return BASE_TICK_MS;
  const ceiling = opts.unreachable ? MAX_OFFLINE_TICK_MS : MAX_IDLE_TICK_MS;
  const doubled = Math.max(opts.previousDelayMs, BASE_TICK_MS) * 2;
  return Math.min(doubled, ceiling);
}

/** True when an error looks like a transport failure rather than rejected data. */
function looksUnreachable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout|Couldn't reach/i.test(
    message,
  );
}

/** Pushes the outbox. Returns rows pushed and rows that failed. */
export async function runSyncTick(): Promise<TickStats> {
  const stats: TickStats = { pushed: 0, pulled: 0, failed: 0, errors: [], unreachable: false };
  if (running) return stats;
  running = true;
  try {
    const client = await syncEngine.loadClient();
    if (!client) return stats;

    const rows = (await dequeueBatch()) as OutboxRow[];
    if (rows.length === 0) {
      await pruneSent();
      return stats;
    }

    const { toPush, allIds } = compact(rows);
    const pushedKeys = new Set<string>();
    const groups = new Map<string, OutboxRow[]>();
    for (const row of toPush) {
      const key = `${row.tableName}|${row.operation}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    for (const [key, groupRows] of groups.entries()) {
      const [tableName, operationStr] = key.split("|");
      if (!tableName || !operationStr) continue;
      const operation = operationStr as "create" | "update" | "delete";
      try {
        await client.pushBatch(
          tableName,
          operation,
          groupRows.map((r) => ({
            rowId: r.rowId,
            payload: r.operation === "delete" ? null : JSON.parse(r.payload),
          })),
        );
        for (const row of groupRows) pushedKeys.add(row.id);
      } catch (e) {
        // Fall back to row-by-row to isolate the failing row.
        if (looksUnreachable(e)) stats.unreachable = true;
        for (const row of groupRows) {
          try {
            await client.pushRow({
              tableName: row.tableName,
              operation: row.operation,
              rowId: row.rowId,
              payload: row.operation === "delete" ? null : JSON.parse(row.payload),
            });
            pushedKeys.add(row.id);
          } catch (innerE) {
            stats.failed += 1;
            if (looksUnreachable(innerE)) stats.unreachable = true;
            stats.errors.push(`push ${row.tableName}/${row.rowId}: ${describe(innerE)}`);
            await scheduleRetry(row, innerE);
          }
        }
      }
    }

    // Retire every outbox entry whose surviving compacted row was pushed —
    // including the superseded ones it stood in for.
    for (const id of allIds) {
      const r = rows.find((x) => x.id === id)!;
      const key = `${r.tableName}|${r.rowId}`;
      const target = toPush.find((x) => `${x.tableName}|${x.rowId}` === key);
      if (target && pushedKeys.has(target.id)) {
        await markSent(id);
        stats.pushed += 1;
      }
    }

    await pruneSent();
    return stats;
  } finally {
    running = false;
  }
}

function describe(err: unknown): string {
  if (err && typeof err === "object" && "userMessage" in err) {
    return String((err as { userMessage: unknown }).userMessage);
  }
  return err instanceof Error ? err.message : String(err);
}

/** One full cycle: push the outbox, then run every pull handler. */
async function runFullTick(): Promise<TickHealth> {
  const startedAt = Date.now();
  const stats: TickStats = { pushed: 0, pulled: 0, failed: 0, errors: [], unreachable: false };

  try {
    const pushStats = await runSyncTick();
    stats.pushed = pushStats.pushed;
    stats.failed += pushStats.failed;
    stats.errors.push(...pushStats.errors);
    stats.unreachable = stats.unreachable || pushStats.unreachable;
  } catch (e) {
    stats.failed += 1;
    stats.errors.push(`push: ${describe(e)}`);
    if (looksUnreachable(e)) stats.unreachable = true;
    logger.error("sync-worker", "sync tick push failed", e);
  }

  // Previously outside the try: a throw from loadClient() or runPulls() escaped
  // the interval callback, so the tick recorded no telemetry at all and the
  // failure surfaced only as an unhandled rejection.
  try {
    const client = await syncEngine.loadClient();
    if (client) {
      const pullStats = await syncEngine.runPulls(client);
      stats.pulled = pullStats.pulled;
      stats.errors.push(...pullStats.errors);
      stats.failed += pullStats.errors.length;
      if (pullStats.errors.some(looksUnreachable)) stats.unreachable = true;
    }
  } catch (e) {
    stats.failed += 1;
    stats.errors.push(`pull: ${describe(e)}`);
    if (looksUnreachable(e)) stats.unreachable = true;
    logger.error("sync-worker", "sync tick pull failed", e);
  }

  const durationMs = Date.now() - startedAt;
  const idle = stats.pushed === 0 && stats.pulled === 0;
  currentDelayMs = nextDelayMs({
    idle,
    unreachable: stats.unreachable,
    previousDelayMs: currentDelayMs,
  });

  const health: TickHealth = { ...stats, at: new Date(), durationMs, nextDelayMs: currentDelayMs };
  lastTick = health;

  if (stats.errors.length > 0) {
    logger.warn("sync-worker", `sync tick completed with ${stats.errors.length} errors`, {
      stats,
      durationMs,
    });
  } else if (!idle) {
    logger.info("sync-worker", "sync tick completed", { stats, durationMs });
  }

  try {
    await prisma().syncTickLog.create({
      data: {
        pushed: stats.pushed,
        pulled: stats.pulled,
        failed: stats.failed,
        durationMs,
        errors: JSON.stringify(stats.errors),
      },
    });
  } catch (logErr) {
    logger.error("sync-worker", "failed to record telemetry to SyncTickLog", logErr);
  }

  // Retire telemetry past its retention window. The stamp is taken before the
  // await rather than after, so a sweep that keeps failing waits the full
  // interval before trying again instead of retrying on every tick; and the
  // whole thing is caught, because keeping the telemetry table tidy is the least
  // important job this worker has and must never be what stops it syncing.
  const nowMs = Date.now();
  if (shouldPruneTickLog(lastTickLogPruneAt, nowMs)) {
    lastTickLogPruneAt = nowMs;
    try {
      const removed = await pruneTickLog();
      if (removed > 0) {
        logger.info("sync-worker", `pruned ${removed} SyncTickLog rows past retention`);
      }
    } catch (pruneErr) {
      logger.error("sync-worker", "failed to prune SyncTickLog", pruneErr);
    }
  }

  return health;
}

export function startCloudSyncWorker(): void {
  if (timer) return;
  currentDelayMs = BASE_TICK_MS;

  // A self-scheduling timeout rather than setInterval: the delay adapts (see
  // nextDelayMs), and a slow tick can never overlap the next one.
  const schedule = (delayMs: number) => {
    timer = setTimeout(async () => {
      await runFullTick();
      if (timer) schedule(currentDelayMs);
    }, delayMs);
  };

  schedule(BASE_TICK_MS);
}

export function stopCloudSyncWorker(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
