import { logger } from "./logger";
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

// ─── sanitizeForCloud ─────────────────────────────────────────────────────────

// Public lab-info columns that exist in the cloud lab_settings table. LabSettings
// also holds encrypted secrets (service key, SMTP/Razorpay secrets) and desktop-only
// config (backup paths, cloud-sync fields) that must NEVER be pushed.
const LAB_SETTINGS_CLOUD_FIELDS = new Set([
  "id", "labName", "labAddress", "labPhone", "labEmail",
  "morningOpenTime", "morningCloseTime", "eveningOpenTime", "eveningCloseTime",
  "weeklyHolidays", "isOpenToday", "manualClosureReason", "childAgeBoundary",
  "pathologistName", "pathologistQuals", "labUpiVpa", "labUpiPayeeName",
  "preferredPaymentGateway", "portalUrl", "updatedAt",
]);

/**
 * Strip local-only / secret fields before a row is pushed to the cloud.
 * Used by BOTH the live sync hook and the backfill so neither leaks secrets
 * or sends columns the cloud tables don't have.
 *  - User.recoveryCodeHash: desktop-side recovery only; cloud users has no such column.
 *  - LabSettings: allowlist to public columns only.
 *  - TestResult: two fields where the cloud column name diverges from a plain
 *    camel→snake of the Prisma field. The cloud (and admin portal) standardised
 *    on is_abnormal_override / entered_by_user_id, so remap before the snake
 *    conversion rather than renaming cloud columns the portal already uses.
 */
/**
 * True when a value can actually live in a cloud column.
 *
 * Prisma returns included relations inline with the scalars, and the outbox
 * mirrors whatever it was handed. `VisitOrchestrator` creates a visit with
 * `include: { visitTests: true }`, so the payload carried a `visit_tests` array
 * and PostgREST rejected the whole row:
 *
 *   Could not find the 'visit_tests' column of 'visits' in the schema cache
 *   [PGRST204]
 *
 * That error is classified non-retryable, so every visit push failed
 * permanently and the cloud never saw a status change.
 *
 * The test is structural rather than a list of relation names. A column holds a
 * scalar; anything array-shaped or object-shaped is a relation. Naming
 * `visitTests` explicitly would fix this one `include` and leave the next one to
 * rediscover the same failure in production.
 *
 * Two objects are not relations and must survive: `Date` (serialised by
 * toSnakePayload) and `Prisma.Decimal` — price, subtotal, total and every
 * refRange* field are Decimal, and dropping them would push priceless tests and
 * totalless invoices, which is worse than the bug being fixed.
 */
function isCloudScalar(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return false;
  if (typeof value !== "object") return true;
  if (value instanceof Date) return true;
  return Prisma.Decimal.isDecimal(value);
}

export function sanitizeForCloud(model: string, row: Record<string, unknown>): Record<string, unknown> {
  let safe: Record<string, unknown> = Object.fromEntries(
    Object.entries(row).filter(([, v]) => isCloudScalar(v)),
  );
  // Visit used to have `accessCodePlaintext` stripped here — a local-only
  // column holding the access code in the clear, which would have defeated the
  // bcrypt hash beside it had it ever been pushed. The credential is gone and
  // so is the column, so there is nothing left to strip.
  if (model === "User") delete safe.recoveryCodeHash;
  if (model === "VisitTest") {
    delete safe.outsourcedSentTo;
    delete safe.outsourcedExternalRef;
    delete safe.outsourcedSentAt;
    delete safe.outsourcedReceivedAt;
  }
  if (model === "TestResult") {
    if ("abnormalOverride" in safe) {
      safe.isAbnormalOverride = safe.abnormalOverride;
      delete safe.abnormalOverride;
    }
    if ("enteredById" in safe) {
      safe.enteredByUserId = safe.enteredById;
      delete safe.enteredById;
    }
  }
  if (model === "LabSettings") {
    safe = Object.fromEntries(Object.entries(safe).filter(([k]) => LAB_SETTINGS_CLOUD_FIELDS.has(k)));
  }
  return safe;
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

  // 6. Strip local-only / secret fields before payload assembly.
  const safeRow = sanitizeForCloud(model, row);

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
          logger.error("cloud", "[cloud-sync] mirrorToOutbox error:", e)
        );

        return result;
      },
    },
  },
});
