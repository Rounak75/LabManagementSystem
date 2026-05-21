// Outbox service — durable write-ahead queue for cloud sync

import { prisma } from "@main/db";
import type { OutboxEnqueueInput } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_RETRIES = 5;
export const OUTBOX_BATCH_SIZE = 100;

/**
 * Returns the back-off delay in milliseconds for a given attempt number
 * (1-indexed). Returns null when attempt is out of range (< 1 or > MAX_RETRIES).
 */
export function retryDelayMs(attempt: number): number | null {
  const delays = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];
  if (attempt < 1 || attempt > MAX_RETRIES) return null;
  return delays[attempt - 1]!;
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Inserts a new Pending row into the outbox.
 */
export async function enqueue(input: OutboxEnqueueInput) {
  const now = new Date();
  return prisma().outbox.create({
    data: {
      tableName: input.tableName,
      operation: input.operation,
      rowId: input.rowId,
      payload: JSON.stringify(input.payload ?? null),
      status: "Pending",
      attempts: 0,
      nextAttemptAt: now,
    },
  });
}

// ─── Dequeue ──────────────────────────────────────────────────────────────────

/**
 * Returns up to OUTBOX_BATCH_SIZE Pending rows whose nextAttemptAt is ≤ now,
 * ordered oldest-first.
 */
export async function dequeueBatch() {
  const now = new Date();
  return prisma().outbox.findMany({
    where: { status: "Pending", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: OUTBOX_BATCH_SIZE,
  });
}

// ─── Mark sent ────────────────────────────────────────────────────────────────

/**
 * Marks a row as Sent, recording the time it was sent.
 */
export async function markSent(id: string) {
  return prisma().outbox.update({
    where: { id },
    data: { status: "Sent", sentAt: new Date() },
  });
}

// ─── Schedule retry ───────────────────────────────────────────────────────────

/**
 * Pull a human-readable message out of whatever was thrown. Cloud pushes throw a
 * ClassifiedSupabaseError ({ retryable, userMessage, raw }), which is a plain
 * object — not an Error — so reading `.message` yields undefined and the error
 * column ends up null. Prefer userMessage, then Error.message, then String().
 */
function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.userMessage === "string") return o.userMessage;
    if (typeof o.message === "string") return o.message;
  }
  return String(err);
}

/** Classified cloud errors flag whether a retry could ever succeed. A schema
 *  mismatch (missing column) is not retryable — failing fast surfaces it now
 *  instead of after ~6 hours of pointless back-off. */
function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "retryable" in err) {
    return (err as { retryable: unknown }).retryable !== false;
  }
  return true;
}

/**
 * Increments attempts on a row. If the error is non-retryable, or the next
 * attempt number would exceed MAX_RETRIES, the row is marked Failed; otherwise
 * it is rescheduled with back-off. Either way the real error is recorded.
 */
export async function scheduleRetry(
  row: { id: string; attempts: number },
  err: unknown
) {
  const nextAttempt = row.attempts + 1;
  const message = errorMessage(err);
  const delay = isRetryable(err) ? retryDelayMs(nextAttempt) : null;

  if (delay === null) {
    return prisma().outbox.update({
      where: { id: row.id },
      data: { status: "Failed", attempts: nextAttempt, error: message },
    });
  }

  return prisma().outbox.update({
    where: { id: row.id },
    data: {
      attempts: nextAttempt,
      nextAttemptAt: new Date(Date.now() + delay),
      error: message,
    },
  });
}

// ─── Prune sent ───────────────────────────────────────────────────────────────

/**
 * Deletes Sent rows whose sentAt is older than 7 days. Returns the count of
 * deleted rows.
 */
export async function pruneSent(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma().outbox.deleteMany({
    where: { status: "Sent", sentAt: { lt: cutoff } },
  });
  return result.count;
}

// ─── Count helpers ────────────────────────────────────────────────────────────

export async function failedCount(): Promise<number> {
  return prisma().outbox.count({ where: { status: "Failed" } });
}

export async function pendingCount(): Promise<number> {
  return prisma().outbox.count({ where: { status: "Pending" } });
}
