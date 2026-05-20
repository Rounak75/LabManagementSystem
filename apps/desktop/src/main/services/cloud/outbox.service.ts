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
 * Increments attempts on a row. If the next attempt number would exceed
 * MAX_RETRIES the row is marked Failed; otherwise it is rescheduled.
 */
export async function scheduleRetry(
  row: { id: string; attempts: number },
  err: Error
) {
  const nextAttempt = row.attempts + 1;
  const delay = retryDelayMs(nextAttempt);

  if (delay === null) {
    // Exceeded MAX_RETRIES — give up
    return prisma().outbox.update({
      where: { id: row.id },
      data: { status: "Failed", attempts: nextAttempt, error: err.message },
    });
  }

  return prisma().outbox.update({
    where: { id: row.id },
    data: {
      attempts: nextAttempt,
      nextAttemptAt: new Date(Date.now() + delay),
      error: err.message,
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
