import { prisma } from "@main/db";
import { enqueue } from "./outbox.service";
import { MODEL_TO_TABLE } from "./types";

const PAGE_SIZE = 500;

const MODELS_ORDER: Array<keyof typeof MODEL_TO_TABLE> = [
  "Doctor",
  "Test",
  "Parameter",
  "LabSettings",
  "Patient",
  "Visit",
  "VisitTest",
  "Result",
  "Invoice",
  "Payment",
  "HomeVisit",
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

async function backfillModel(modelName: string): Promise<void> {
  const tableName = MODEL_TO_TABLE[modelName];
  if (!tableName) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo: any = (prisma() as any)[modelName.charAt(0).toLowerCase() + modelName.slice(1)];
  if (!repo?.findMany) return;

  let cursor: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows: Array<{ id: string } & Record<string, unknown>> = await repo.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      await enqueue({
        tableName,
        operation: "create",
        rowId: row.id,
        payload: toSnakePayload(row),
      });
    }
    cursor = rows[rows.length - 1]!.id;
  }
}

export async function runBackfillOnce(): Promise<{ skipped: boolean }> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s) return { skipped: true };
  if (!s.cloudSyncEnabled) return { skipped: true };
  if (s.backfillCompletedAt) return { skipped: true };

  for (const model of MODELS_ORDER) {
    await backfillModel(model);
  }

  await prisma().labSettings.update({
    where: { id: "singleton" },
    data: { backfillCompletedAt: new Date() },
  });

  return { skipped: false };
}
