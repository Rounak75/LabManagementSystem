import { prisma } from "@main/db";
import { enqueue } from "./outbox.service";
import { MODEL_TO_TABLE } from "./types";
import { sanitizeForCloud, toSnakePayload } from "./prisma-hooks";

const PAGE_SIZE = 500;

// Order matters: parents before children so the cloud FK constraints
// (added in 20260521000001_phase_3e_add_foreign_keys.sql) are satisfied as
// rows stream up. Model names MUST match the Prisma model names exactly —
// the earlier "Parameter"/"Result" entries were dead (real names are
// "TestParameter"/"TestResult"), and "User" was missing entirely, so users
// and the test-catalog parameters/results never backfilled.
const MODELS_ORDER: Array<keyof typeof MODEL_TO_TABLE> = [
  "User",
  "Doctor",
  "Test",
  "TestParameter",
  "LabSettings",
  "Patient",
  "Visit",
  "VisitTest",
  "TestResult",
  "Invoice",
  "Payment",
  "HomeVisit",
];

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
        payload: toSnakePayload(sanitizeForCloud(modelName, row)),
      });
    }
    cursor = rows[rows.length - 1]!.id;
  }
}

export async function runBackfillOnce(force = false): Promise<{ skipped: boolean }> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s) return { skipped: true };
  if (!s.cloudSyncEnabled) return { skipped: true };
  if (!force && s.backfillCompletedAt) return { skipped: true };

  for (const model of MODELS_ORDER) {
    await backfillModel(model);
  }

  await prisma().labSettings.update({
    where: { id: "singleton" },
    data: { backfillCompletedAt: new Date() },
  });

  return { skipped: false };
}
