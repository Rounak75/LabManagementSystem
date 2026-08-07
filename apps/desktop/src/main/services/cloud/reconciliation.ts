import { logger } from "./logger";
import { prisma } from "@main/db";
import { enqueue } from "./outbox.service";
import { sanitizeForCloud, toSnakePayload } from "./prisma-hooks";
import { MODEL_TO_TABLE } from "./types";

// These are Prisma model names, and they have to match MODEL_TO_TABLE exactly.
// "Result" and "Parameter" sat here long after the models were renamed
// TestResult and TestParameter, so MODEL_TO_TABLE returned undefined for both
// and reconcileTable bailed at its first line — results and parameters were
// silently never reconciled. The annotation did not catch it because
// MODEL_TO_TABLE is declared Record<string, string>, whose keyof is string.
const MODELS: Array<keyof typeof MODEL_TO_TABLE> = [
  "Patient", "Visit", "VisitTest", "TestResult", "Invoice", "Payment",
  "Doctor", "Test", "TestParameter", "LabSettings", "HomeVisit",
];

async function reconcileTable(modelName: keyof typeof MODEL_TO_TABLE): Promise<void> {
  const tableName = MODEL_TO_TABLE[modelName];
  if (!tableName) return;
  const cursorKey = `reconcile_${tableName}`;
  const cursor = await prisma().syncCursor.findUnique({ where: { source: cursorKey } });

  // No cursor means this machine has never reconciled this table. Starting from
  // epoch would read every row it has ever held and re-enqueue each one the
  // outbox no longer remembers — and the outbox forgets fast, since pruneSent()
  // deletes Sent rows after seven days. On results, the highest-cardinality
  // table here, that is the lab's entire history pushed again in one go.
  //
  // Reconciliation exists to catch what the live hook missed, and the backfill
  // has already sent everything that predates it (runReconciliation refuses to
  // run until backfillCompletedAt is set). So it starts watching from now, and
  // the first pass it does real work on is the next one.
  if (!cursor) {
    await prisma().syncCursor.upsert({
      where: { source: cursorKey },
      update: {},
      create: { source: cursorKey, lastSyncedAt: new Date() },
    });
    return;
  }

  const since = cursor.lastSyncedAt ?? new Date(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo: any = (prisma() as any)[modelName.charAt(0).toLowerCase() + modelName.slice(1)];
  if (!repo?.findMany) return;
  const rows: Array<{ id: string; updatedAt?: Date } & Record<string, unknown>> = await repo.findMany({
    where: { updatedAt: { gt: since } },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) return;

  const ids = rows.map((r) => r.id);
  const known = await prisma().outbox.findMany({
    where: { tableName, rowId: { in: ids } },
    select: { rowId: true },
  });
  const knownSet = new Set(known.map((k: { rowId: string }) => k.rowId));

  let maxUpdated = since;
  for (const row of rows) {
    if (!knownSet.has(row.id)) {
      // Sanitise exactly as the live hook and the backfill do. This path kept a
      // private copy of toSnakePayload and skipped sanitizeForCloud entirely,
      // so a row repaired here was pushed raw: LabSettings carried the
      // encrypted service key, SMTP password and Razorpay secret, none of which
      // the cloud has columns for, and Visit carried a plaintext access code
      // back when that column existed.
      await enqueue({
        tableName,
        operation: "update",
        rowId: row.id,
        payload: toSnakePayload(sanitizeForCloud(modelName, row)),
      });
    }
    if (row.updatedAt && row.updatedAt > maxUpdated) maxUpdated = row.updatedAt;
  }

  await prisma().syncCursor.upsert({
    where: { source: cursorKey },
    update: { lastSyncedAt: maxUpdated },
    create: { source: cursorKey, lastSyncedAt: maxUpdated },
  });
}

export async function runReconciliation(): Promise<void> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.cloudSyncEnabled) return;
  if (!s.backfillCompletedAt) return;

  for (const model of MODELS) {
    try {
      await reconcileTable(model);
    } catch (e) {
      logger.error("cloud", `[cloud] reconciliation failed for ${model}`, e);
    }
  }
}
