import { prisma } from "@main/db";
import { enqueue } from "./outbox.service";
import { MODEL_TO_TABLE } from "./types";

const MODELS: Array<keyof typeof MODEL_TO_TABLE> = [
  "Patient", "Visit", "VisitTest", "Result", "Invoice", "Payment",
  "Doctor", "Test", "Parameter", "LabSettings", "HomeVisit",
];

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

function toSnakePayload(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[camelToSnake(k)] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

async function reconcileTable(modelName: keyof typeof MODEL_TO_TABLE): Promise<void> {
  const tableName = MODEL_TO_TABLE[modelName];
  if (!tableName) return;
  const cursorKey = `reconcile_${tableName}`;
  const cursor = await prisma().syncCursor.findUnique({ where: { source: cursorKey } });
  const since = cursor?.lastSyncedAt ?? new Date(0);

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
      await enqueue({
        tableName,
        operation: "update",
        rowId: row.id,
        payload: toSnakePayload(row),
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
      console.error(`[cloud] reconciliation failed for ${model}`, e);
    }
  }
}
