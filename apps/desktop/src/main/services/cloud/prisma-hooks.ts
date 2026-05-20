// Prisma $extends hook — mirrors successful writes on synced models to the Outbox.
// Best-effort (fire-and-forget); errors are logged, never thrown.

import { Prisma } from "@lab/db";
import { prisma } from "@main/db";
import { enqueue } from "./outbox.service";
import { SYNCED_MODELS, MODEL_TO_TABLE } from "./types";
import type { OutboxOperation } from "./types";

// ─── camelCase → snake_case ───────────────────────────────────────────────────

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

// ─── toSnakePayload ───────────────────────────────────────────────────────────

/**
 * Converts an object's keys from camelCase to snake_case and serialises
 * Date values to ISO-8601 strings.
 */
export function toSnakePayload(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const snakeKey = camelToSnake(key);
    result[snakeKey] = value instanceof Date ? value.toISOString() : value;
  }
  return result;
}

// ─── mirrorToOutbox ───────────────────────────────────────────────────────────

/**
 * The testable core of the Prisma hook.
 *
 * No-ops when:
 *  - model is not in SYNCED_MODELS
 *  - operation is not create | update | delete (e.g. createMany)
 *  - cloudSyncEnabled is false
 *  - result.id is missing
 */
export async function mirrorToOutbox({
  model,
  operation,
  result,
}: {
  model: string | undefined;
  operation: string;
  result: unknown;
}): Promise<void> {
  // 1. Guard: only synced models
  if (!model || !SYNCED_MODELS.has(model)) return;

  // 2. Guard: only individual-row operations
  const allowedOps: OutboxOperation[] = ["create", "update", "delete"];
  if (!(allowedOps as string[]).includes(operation)) return;

  // 3. Guard: result must be an object with an id
  const row = result as Record<string, unknown> | null | undefined;
  if (!row || typeof row.id !== "string" || !row.id) return;

  // 4. Guard: cloudSyncEnabled must be true
  const settings = await prisma().labSettings.findUnique({
    where: { id: "singleton" },
    select: { cloudSyncEnabled: true },
  });
  if (!settings?.cloudSyncEnabled) return;

  // 5. Map model → table name
  const tableName = MODEL_TO_TABLE[model];
  if (!tableName) return;

  // 6. Strip local-only sensitive fields before payload assembly.
  //    Visit.accessCodePlaintext stays on the desktop ONLY — it would defeat
  //    the bcrypt hash if pushed to the cloud.
  //    User.recoveryCodeHash is for desktop-side password recovery only;
  //    never push (the Edge Function only needs passwordHash for bcrypt compare).
  const safeRow: Record<string, unknown> = { ...row };
  if (model === "Visit") {
    delete safeRow.accessCodePlaintext;
  }
  if (model === "User") {
    delete safeRow.recoveryCodeHash;
  }

  // 7. Enqueue
  const op = operation as OutboxOperation;
  await enqueue({
    tableName,
    operation: op,
    rowId: row.id,
    payload: op === "delete" ? null : toSnakePayload(safeRow),
  });
}

// ─── outboxExtension ─────────────────────────────────────────────────────────

/**
 * Prisma $extends extension that wraps every model operation.
 * After the original query succeeds, it fire-and-forget calls mirrorToOutbox.
 */
export const outboxExtension = Prisma.defineExtension({
  name: "cloud-sync-outbox",
  query: {
    $allModels: {
      async $allOperations({
        model,
        operation,
        args,
        query,
      }: {
        model: string | undefined;
        operation: string;
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) {
        const result = await query(args);

        // Fire-and-forget — never block or throw into the caller
        mirrorToOutbox({ model, operation, result }).catch((e) =>
          console.error("[cloud-sync] mirrorToOutbox error:", e)
        );

        return result;
      },
    },
  },
});
