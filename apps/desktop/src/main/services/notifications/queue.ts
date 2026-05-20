import { prisma } from "@main/db";
import type {
  EnqueueRow,
  NotificationChannel,
} from "./types";

export const DAILY_CAP_PER_CHANNEL = 200;

export class DailyQuotaExceededError extends Error {
  code = "DAILY_QUOTA_EXCEEDED";
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function dailyCount(channel: NotificationChannel): Promise<number> {
  return prisma().notification.count({
    where: {
      channel,
      createdAt: { gte: startOfTodayUtc() },
      status: { not: "Pending" },
    },
  });
}

export async function enqueue(row: EnqueueRow): Promise<string> {
  const count = await dailyCount(row.channel);
  if (count >= DAILY_CAP_PER_CHANNEL) {
    throw new DailyQuotaExceededError(`Daily cap of ${DAILY_CAP_PER_CHANNEL} reached`);
  }
  const created = await prisma().notification.create({
    data: {
      visitId: row.visitId,
      patientId: row.patientId,
      channel: row.channel,
      recipient: row.recipient,
      purpose: row.purpose,
      status: row.status,
      scheduledFor: row.scheduledFor,
      subject: row.subject,
    },
  });
  return created.id;
}

export async function cancel(id: string): Promise<{ ok: boolean; reason?: string }> {
  const row = await prisma().notification.findUnique({ where: { id } });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (row.status === "Sent") return { ok: false, reason: "ALREADY_SENT" };
  if (row.cancelledAt) return { ok: true };
  await prisma().notification.update({
    where: { id },
    data: { cancelledAt: new Date() },
  });
  return { ok: true };
}

export async function markSending(id: string): Promise<boolean> {
  const res = await prisma().notification.updateMany({
    where: { id, status: "Pending", cancelledAt: null },
    data: { status: "Sending" },
  });
  return res.count === 1;
}

export async function markSent(id: string, messageId: string, payload: string): Promise<void> {
  await prisma().notification.update({
    where: { id },
    data: {
      status: "Sent",
      messageId,
      payload,
      sentAt: new Date(),
      error: null,
      nextAttemptAt: null,
    },
  });
}

export async function markRetryable(id: string, delayMs: number, error: string): Promise<void> {
  const next = new Date(Date.now() + delayMs);
  await prisma().notification.update({
    where: { id },
    data: {
      status: "Pending",
      attempts: { increment: 1 },
      nextAttemptAt: next,
      error,
    },
  });
}

export async function markFailed(id: string, error: string): Promise<void> {
  await prisma().notification.update({
    where: { id },
    data: {
      status: "Failed",
      attempts: { increment: 1 },
      nextAttemptAt: null,
      error,
    },
  });
}

export async function dueRows(now: Date) {
  return prisma().notification.findMany({
    where: {
      status: "Pending",
      cancelledAt: null,
      OR: [
        { scheduledFor: null },
        { scheduledFor: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: now } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}

/** Re-queue rows stuck in Sending for more than 5 minutes. */
export async function recoverStuckSending(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const res = await prisma().notification.updateMany({
    where: { status: "Sending", updatedAt: { lt: cutoff } },
    data: {
      status: "Pending",
      nextAttemptAt: new Date(Date.now() + 60_000),
    },
  });
  return res.count;
}

/** Mark rows older than 7 days as Failed (abandoned). */
export async function abandonStale(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const res = await prisma().notification.updateMany({
    where: { status: "Pending", createdAt: { lt: cutoff } },
    data: { status: "Failed", error: "abandoned (>7 days pending)" },
  });
  return res.count;
}

export async function failedCount(): Promise<number> {
  return prisma().notification.count({ where: { status: "Failed" } });
}

/** Flip WaitingForPayment ReportReady email rows to Pending. */
export async function releaseWaitingForPayment(visitId: string): Promise<number> {
  const res = await prisma().notification.updateMany({
    where: { visitId, purpose: "ReportReady", channel: "Email", status: "WaitingForPayment" },
    data: { status: "Pending", scheduledFor: new Date() },
  });
  return res.count;
}
