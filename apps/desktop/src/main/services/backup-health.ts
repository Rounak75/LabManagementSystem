// What the dashboard says about backups.
//
// Pure on purpose: no Prisma, no clock, no filesystem. The caller reads the rows
// and passes the time in, which is what makes every case below testable without
// standing up a database — the same reason `isBackupDue` and
// `shouldAttemptAfterFailure` are exported from backup.service.ts rather than
// buried inside the scheduler.

import type { BackupHealth } from "@shared/api";

export type { BackupHealth, BackupTone } from "@shared/api";

/** One row of BackupLog, narrowed to what a verdict actually depends on. */
export interface BackupRun {
  /** "success" | "partial" | "failed", as written by `runBackup`. */
  status: string;
  createdAt: Date;
}

export interface BackupHealthInput {
  /** The most recent run, or null if the lab has never run one. */
  latest: BackupRun | null;
  /**
   * When an off-machine copy last verified, or null if it never has.
   *
   * Passed in rather than scanned out of a list of runs: the caller reads a
   * capped page of BackupLog, and "never" derived from ten rows would be a
   * falsehood told to a lab whose last good copy was the eleventh. A targeted
   * query knows; a truncated list only guesses.
   */
  lastOffMachineSuccessAt: Date | null;
  /** Whether Settings names an off-machine path at all. */
  offMachineConfigured: boolean;
  now: Date;
}

/**
 * A "partial" run wrote the local copy but not the off-machine one.
 *
 * This is the case the whole module exists for. `runBackup` still advances
 * `lastBackupAt` for it — correctly, because a local backup genuinely was made —
 * which means `isBackupDue` goes quiet for the rest of the day and the scheduler
 * clears its back-off. Nothing else mentions it again, so the alarm has to.
 */
export function describeBackupHealth({
  latest,
  lastOffMachineSuccessAt,
  offMachineConfigured,
  now,
}: BackupHealthInput): BackupHealth {
  // Checked before the run status, because this is the case where the status is
  // a clean "success" and still means the lab holds one copy of its data. There
  // is no "partial" to catch here — nothing was attempted to fail.
  if (!offMachineConfigured) {
    return {
      tone: "alarm",
      headline: "No off-machine backup location set",
      detail:
        "Every backup is on the same disk as the live database, so a drive failure would take both. " +
        "Set a backup drive in Settings → Backup.",
    };
  }

  if (!latest) {
    return {
      tone: "alarm",
      headline: "No backup has ever run",
      detail:
        "There is one copy of the lab's records. Run one now from Settings → Backup.",
    };
  }

  if (latest.status === "failed") {
    return {
      tone: "alarm",
      headline: "Last backup failed",
      detail:
        "No copy was written. The usual causes are a full disk or a drive that is no longer attached.",
    };
  }

  if (latest?.status === "partial") {
    const since = lastOffMachineSuccessAt
      ? `has not been written for ${describeElapsed(lastOffMachineSuccessAt, now)}`
      : "has never been written";

    return {
      tone: "alarm",
      headline: "No off-machine backup",
      detail:
        `The copy that survives this PC's disk failing ${since}. ` +
        "Plug in the backup drive.",
    };
  }

  // Both copies were written and verified — but only recently enough to count.
  // The scheduler catches a missed window up as soon as the app runs, so a gap
  // this size means the app has not been running at all.
  if (latest && ageInDays(latest.createdAt, now) >= STALE_AFTER_DAYS) {
    return {
      tone: "warn",
      headline: "No recent backup",
      detail:
        `The last backup was ${describeElapsed(latest.createdAt, now)} ago. ` +
        "Anything entered since exists only in the live database.",
    };
  }

  return { tone: "ok", headline: "Backups healthy", detail: null };
}

/**
 * How old the newest backup may be before it is worth mentioning.
 *
 * Two, so that the ordinary shape of the lab's week — the PC off overnight, off
 * on Sunday — never trips it, and a genuine multi-day gap does.
 */
const STALE_AFTER_DAYS = 2;

function ageInDays(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / 86_400_000;
}

/** Whole days, in words, floored — "6 days" reads as at-least-six, which is true. */
function describeElapsed(from: Date, now: Date): string {
  const days = Math.floor((now.getTime() - from.getTime()) / 86_400_000);
  if (days < 1) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}
