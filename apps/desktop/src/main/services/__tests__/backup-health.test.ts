import { describe, it, expect } from "vitest";
import { describeBackupHealth, type BackupRun } from "@main/services/backup-health";

const at = (iso: string) => new Date(iso);

function run(overrides: Partial<BackupRun> = {}): BackupRun {
  return { status: "success", createdAt: at("2026-08-14T02:00:00Z"), ...overrides };
}

/**
 * The verdict the dashboard shows about backups.
 *
 * Sync has had a card and a sidebar dot since Phase 3e; backups had neither, so
 * the only place a failure appeared was the history table in Settings, which you
 * have to go looking for. That gap matters most in exactly one case: a run whose
 * off-machine copy failed is logged "partial" but still advances `lastBackupAt`,
 * so the scheduler stops considering a backup due and nothing else ever mentions
 * it again. The USB stick can sit unplugged for weeks while the primary copy —
 * on the same disk as the live database — keeps succeeding.
 *
 * `lastOffMachineSuccessAt` is passed in rather than scanned out of `latest`
 * because the caller reads a capped list. Deriving "never" from ten rows would
 * announce it to a lab whose last good copy was simply the eleventh.
 */
describe("describeBackupHealth", () => {
  it("raises an alarm when the last run made no off-machine copy", () => {
    const health = describeBackupHealth({
      latest: run({ status: "partial" }),
      lastOffMachineSuccessAt: at("2026-08-13T02:00:00Z"),
      offMachineConfigured: true,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.tone).toBe("alarm");
  });

  // "Something is wrong" is ignorable; "six days" is not. The number is the
  // whole point — an unplugged stick looks identical on day one and day thirty,
  // and only the elapsed time tells the owner which of those they are in.
  it("says how long it has been since an off-machine copy last succeeded", () => {
    const health = describeBackupHealth({
      latest: run({ status: "partial" }),
      lastOffMachineSuccessAt: at("2026-08-08T02:00:00Z"),
      offMachineConfigured: true,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.detail).toContain("6 days");
  });

  // Worse than a stale copy, and it must not read as a blank. A lab that has
  // never once written an off-machine backup has exactly one copy of every
  // patient record it holds, on one disk.
  it("says so when an off-machine copy has never succeeded", () => {
    const health = describeBackupHealth({
      latest: run({ status: "partial" }),
      lastOffMachineSuccessAt: null,
      offMachineConfigured: true,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.detail).toContain("never");
  });

  /**
   * The quietest version of the same hole.
   *
   * `runBackup` only attempts the off-machine copy when a path is set, so with
   * the field left blank every run is logged a clean "success" — there is no
   * "partial" to notice, because nothing was attempted. The log is telling the
   * truth and the lab still has exactly one copy of its data.
   */
  it("does not call a lab healthy when no off-machine location is configured", () => {
    const health = describeBackupHealth({
      latest: run({ status: "success" }),
      lastOffMachineSuccessAt: null,
      offMachineConfigured: false,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.tone).not.toBe("ok");
  });

  // A total failure — full disk, unreadable write — leaves `lastBackupAt`
  // untouched, so the scheduler does keep retrying this one. It still deserves
  // to be on screen: retrying every 30 minutes against a full disk succeeds
  // never, and the owner is the only one who can clear it.
  it("raises an alarm when the last run failed outright", () => {
    const health = describeBackupHealth({
      latest: run({ status: "failed" }),
      lastOffMachineSuccessAt: at("2026-08-13T02:00:00Z"),
      offMachineConfigured: true,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.tone).toBe("alarm");
  });

  /**
   * A clean success four days old is not health, it is a stopped clock.
   *
   * The scheduler catches a missed window up the moment the app next runs, so a
   * gap this long means the app has not been running — the home PC off for a
   * long weekend. Every patient registered in that time exists in exactly one
   * place. Warn rather than alarm: this resolves itself the moment the PC comes
   * back, and an alarm for a normal holiday is how alarms get ignored.
   */
  it("warns when no backup has run for days, even though the last one succeeded", () => {
    const health = describeBackupHealth({
      latest: run({ status: "success", createdAt: at("2026-08-10T02:00:00Z") }),
      lastOffMachineSuccessAt: at("2026-08-10T02:00:00Z"),
      offMachineConfigured: true,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.tone).toBe("warn");
  });

  // An empty BackupLog is the state a fresh install is in, and "no news" must
  // not render as good news on the one screen the owner actually watches.
  it("raises an alarm when no backup has ever run", () => {
    const health = describeBackupHealth({
      latest: null,
      lastOffMachineSuccessAt: null,
      offMachineConfigured: true,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.tone).toBe("alarm");
  });

  it("is healthy when the last run wrote and verified both copies", () => {
    const health = describeBackupHealth({
      latest: run({ status: "success" }),
      lastOffMachineSuccessAt: at("2026-08-14T02:00:00Z"),
      offMachineConfigured: true,
      now: at("2026-08-14T09:00:00Z"),
    });

    expect(health.tone).toBe("ok");
  });
});
