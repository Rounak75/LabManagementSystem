import { app } from "electron";
import { join } from "path";
import { mkdirSync, statSync, readdirSync, unlinkSync, existsSync } from "fs";
import { prisma } from "@main/db";
import { paymentDueScan, homeVisitReminderScan } from "@main/services/notifications/triggers";

function backupDir(): string {
  const dir = join(app.getPath("userData"), "backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function runBackup(opts: {
  kind: "auto" | "manual";
  secondaryPath?: string | null;
  filenamePrefix?: string;
}) {
  const prefix = opts.filenamePrefix ?? "lab";
  const filename = `${prefix}-${timestamp()}.sqlite`;
  const primary = join(backupDir(), filename);
  try {
    // VACUUM INTO doesn't accept a parameterized path in all SQLite builds;
    // path is server-controlled, but escape single quotes defensively.
    const safePrimary = primary.replace(/'/g, "''");
    await prisma().$queryRawUnsafe(`VACUUM INTO '${safePrimary}'`);
    const sizeBytes = BigInt(statSync(primary).size);

    // The primary copy sits on the same disk as the live database, so the
    // off-machine copy is the one that survives a disk failure. If it fails we
    // must not report the run as a success — that tells the owner they are
    // protected when they are not.
    let secondaryError: string | null = null;
    if (opts.secondaryPath) {
      try {
        if (!existsSync(opts.secondaryPath)) mkdirSync(opts.secondaryPath, { recursive: true });
        const secondary = join(opts.secondaryPath, filename);
        const safeSecondary = secondary.replace(/'/g, "''");
        await prisma().$queryRawUnsafe(`VACUUM INTO '${safeSecondary}'`);
      } catch (err) {
        secondaryError = String(err);
        await prisma().backupLog.create({
          data: {
            kind: opts.kind,
            destination: opts.secondaryPath,
            sizeBytes: BigInt(0),
            status: "failed",
            error: secondaryError,
          },
        });
      }
    }

    const log = await prisma().backupLog.create({
      data: {
        kind: opts.kind,
        destination: primary,
        sizeBytes,
        // "partial": the local copy exists but the off-machine copy does not.
        // The UI treats anything other than "success" as needing attention.
        status: secondaryError ? "partial" : "success",
        error: secondaryError
          ? `Saved locally, but the off-machine copy failed: ${secondaryError}`
          : null,
      },
    });
    await prisma().labSettings.update({
      where: { id: "singleton" },
      data: { lastBackupAt: new Date() },
    });
    return log;
  } catch (err) {
    return prisma().backupLog.create({
      data: {
        kind: opts.kind,
        destination: primary,
        sizeBytes: BigInt(0),
        status: "failed",
        error: String(err),
      },
    });
  }
}

export function pruneOld(retentionDays: number): number {
  const dir = backupDir();
  const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    // Match on the extension, not a "lab-" prefix: runBackup accepts a custom
    // filenamePrefix, and those backups were never pruned. Only .sqlite files in
    // the managed backups directory are touched, so unrelated files are safe.
    if (!name.endsWith(".sqlite")) continue;
    const full = join(dir, name);
    if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      removed++;
    }
  }
  return removed;
}

let timer: NodeJS.Timeout | null = null;

/**
 * Whether today's scheduled backup still needs to run.
 *
 * The scheduler used to fire only when the wall-clock string equalled
 * `backupTime` exactly, checked once a minute, with the "already ran today"
 * marker held in memory. If the app was not running at that precise minute — PC
 * off, app closed, machine asleep, or the interval simply drifting past it — the
 * day had no backup and nothing ever caught up. On a lab whose only master copy
 * is one SQLite file, that is silent data-loss exposure.
 *
 * This asks "is today's scheduled time in the past, and is the last recorded
 * backup older than it?" — so a missed window is caught up the moment the app
 * next runs, and the persisted `lastBackupAt` (rather than in-memory state)
 * keeps a restart from repeating or forgetting a run.
 */
export function isBackupDue(now: Date, backupTime: string, lastBackupAt: Date | null): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(backupTime?.trim() ?? "");
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return false;

  const scheduledToday = new Date(now);
  scheduledToday.setHours(hours, minutes, 0, 0);

  if (now < scheduledToday) return false;
  if (!lastBackupAt) return true;
  return lastBackupAt < scheduledToday;
}

/** Back-off between retries of a backup that failed outright. */
export const FAILED_RETRY_MS = 30 * 60 * 1000;

/**
 * Whether enough time has passed to retry after a failed attempt.
 *
 * A backup that fails (full disk, missing volume) leaves `lastBackupAt`
 * untouched and therefore stays due, so the once-a-minute scheduler would retry
 * it 1,440 times a day and fill BackupLog with identical failures. It should
 * keep trying — a disk that is full at 02:00 may have room by morning — just not
 * every minute.
 */
export function shouldAttemptAfterFailure(now: Date, lastFailedAttemptAt: Date | null): boolean {
  if (!lastFailedAttemptAt) return true;
  return now.getTime() - lastFailedAttemptAt.getTime() >= FAILED_RETRY_MS;
}

let lastFailedAttemptAt: Date | null = null;

export function startScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      const settings = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
      if (!settings) return;
      const now = new Date();
      if (
        isBackupDue(now, settings.backupTime, settings.lastBackupAt ?? null) &&
        shouldAttemptAfterFailure(now, lastFailedAttemptAt)
      ) {
        const log = await runBackup({ kind: "auto", secondaryPath: settings.backupPath });
        // "partial" already advanced lastBackupAt, so only a total failure needs
        // throttling; anything else clears the back-off.
        lastFailedAttemptAt = log.status === "failed" ? new Date() : null;
        pruneOld(settings.backupRetentionDays);
        try {
          const n = await paymentDueScan();
          if (n > 0) console.log(`[notifications] paymentDueScan enqueued ${n}`);
        } catch (err) {
          console.error("[notifications] paymentDueScan failed", err);
        }
        try {
          const n = await homeVisitReminderScan();
          if (n > 0) console.log(`[notifications] homeVisitReminderScan enqueued ${n}`);
        } catch (err) {
          console.error("[notifications] homeVisitReminderScan failed", err);
        }
      }
    } catch {
      // never crash the app from the scheduler
    }
  }, 60_000);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
