import { dequeueBatch, markSent, scheduleRetry, pruneSent } from "./outbox.service";
import { syncEngine } from "./sync-engine";
import "./sync-registry";
import { logger } from "./logger";
import { prisma } from "@main/db";

const TICK_MS = 5_000;
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

export async function runSyncTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const client = await syncEngine.loadClient();
    if (!client) return;
    const rows = (await dequeueBatch()) as OutboxRow[];
    if (rows.length === 0) {
      await pruneSent();
      return;
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
          }))
        );
        for (const row of groupRows) pushedKeys.add(row.id);
      } catch (e) {
        // Fallback to row-by-row to isolate the failing row
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
            await scheduleRetry(row, innerE);
          }
        }
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

export function startCloudSyncWorker(): void {
  if (timer) return;
  timer = setInterval(async () => {
    const startTime = Date.now();
    let stats = { pushed: 0, pulled: 0, errors: [] as string[] };
    
    try { 
      await runSyncTick(); 
      stats.pushed++; 
    } catch (e) { 
      stats.errors.push(`push: ${e}`); 
      logger.error("sync-worker", "sync tick push failed", e); 
    }
    
    const client = await syncEngine.loadClient();
    if (client) {
      const pullStats = await syncEngine.runPulls(client);
      stats.pulled = pullStats.pulled;
      stats.errors.push(...pullStats.errors);
    }
    
    const durationMs = Date.now() - startTime;
    
    if (stats.errors.length > 0) {
      logger.warn("sync-worker", `sync tick completed with ${stats.errors.length} errors`, { stats, durationMs });
    } else {
      logger.info("sync-worker", "sync tick completed", { stats, durationMs });
    }

    try {
      // @ts-ignore - Prisma client may not have regenerated SyncTickLog yet
      await prisma().syncTickLog.create({
        data: {
          pushed: stats.pushed,
          pulled: stats.pulled,
          failed: stats.errors.length,
          durationMs,
          errors: JSON.stringify(stats.errors)
        }
      });
    } catch (logErr) {
      logger.error("sync-worker", "failed to record telemetry to SyncTickLog", logErr);
    }
  }, TICK_MS);
}

export function stopCloudSyncWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
