import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";

type FakeBackupLog = {
  id: string;
  kind: string;
  destination: string;
  sizeBytes: bigint;
  status: string;
  error: string | null;
  createdAt: Date;
};

type FakeLabSettings = {
  id: string;
  backupPath: string | null;
  backupRetentionDays: number;
  backupTime: string;
  lastBackupAt: Date | null;
};

const backupLogs: FakeBackupLog[] = [];
let backupCounter = 0;

const labSettings: FakeLabSettings = {
  id: "singleton",
  backupPath: null,
  backupRetentionDays: 14,
  backupTime: "02:00",
  lastBackupAt: null,
};

let queryRawShouldThrow: { match?: string; error: string } | null = null;

const fakePrisma = {
  $queryRawUnsafe: vi.fn(async (sql: string) => {
    if (queryRawShouldThrow && (!queryRawShouldThrow.match || sql.includes(queryRawShouldThrow.match))) {
      throw new Error(queryRawShouldThrow.error);
    }
    // Simulate VACUUM INTO writing a file at the path inside the SQL string.
    const m = sql.match(/VACUUM INTO '(.+)'/);
    if (m && m[1]) {
      const path = m[1].replace(/''/g, "'");
      // Ensure parent dir exists
      const dir = path.substring(0, path.lastIndexOf(/[\\/]/.test(path) ? (path.includes("\\") ? "\\" : "/") : "/"));
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path, "fake sqlite contents");
    }
    return [];
  }),
  backupLog: {
    create: vi.fn(async ({ data }: any) => {
      const row: FakeBackupLog = {
        id: `bl-${++backupCounter}`,
        kind: data.kind,
        destination: data.destination,
        sizeBytes: typeof data.sizeBytes === "bigint" ? data.sizeBytes : BigInt(data.sizeBytes ?? 0),
        status: data.status,
        error: data.error ?? null,
        createdAt: new Date(),
      };
      backupLogs.push(row);
      return row;
    }),
  },
  labSettings: {
    update: vi.fn(async ({ where, data }: any) => {
      if (where.id !== labSettings.id) throw new Error("not found");
      Object.assign(labSettings, data);
      return labSettings;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id === labSettings.id) return labSettings;
      return null;
    }),
  },
};

let tempDir: string;
tempDir = fs.mkdtempSync(join(os.tmpdir(), "lab-backup-test-"));

vi.mock("electron", () => ({
  app: {
    getPath: () => tempDir,
    isPackaged: false,
  },
  dialog: {},
}));

vi.mock("@main/db", () => ({ prisma: () => fakePrisma }));

import { runBackup, pruneOld, isBackupDue, shouldAttemptAfterFailure } from "../backup.service";
import type { BackupVerification } from "../backup.service";

// These tests cover what runBackup does with a verdict, not how the verdict is
// reached — verifyBackup is exercised against real SQLite in backup-verify.test.ts.
// The fake writes a text file, which no honest verifier would accept, so the
// verdict is injected here rather than faked at the SQLite level.
const passes = async (): Promise<BackupVerification> => ({ ok: true, rows: 42 });
const fails = async (): Promise<BackupVerification> => ({ ok: false, reason: "not a database" });

beforeEach(() => {
  backupLogs.length = 0;
  backupCounter = 0;
  labSettings.backupPath = null;
  labSettings.lastBackupAt = null;
  queryRawShouldThrow = null;
  fakePrisma.$queryRawUnsafe.mockClear();
  fakePrisma.backupLog.create.mockClear();
  fakePrisma.labSettings.update.mockClear();
  // Clean backups dir between tests
  const dir = join(tempDir, "backups");
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) fs.unlinkSync(join(dir, name));
  }
});

afterEach(() => {
  // nothing
});

describe("runBackup", () => {
  it("creates a file in the userData backups dir, inserts a successful BackupLog, updates LabSettings.lastBackupAt", async () => {
    const log = await runBackup({ kind: "manual", verify: passes });

    const backupsDir = join(tempDir, "backups");
    expect(fs.existsSync(backupsDir)).toBe(true);
    const files = fs.readdirSync(backupsDir).filter((f) => f.endsWith(".sqlite"));
    expect(files.length).toBe(1);

    expect(log.status).toBe("success");
    expect(log.kind).toBe("manual");
    expect(typeof log.sizeBytes).toBe("bigint");
    expect(log.sizeBytes).toBeGreaterThan(0n);

    expect(fakePrisma.labSettings.update).toHaveBeenCalledWith({
      where: { id: "singleton" },
      data: { lastBackupAt: expect.any(Date) },
    });
  });

  it("also writes to secondaryPath when provided", async () => {
    const secondary = fs.mkdtempSync(join(os.tmpdir(), "lab-backup-secondary-"));
    await runBackup({ kind: "manual", secondaryPath: secondary, verify: passes });

    const primaryFiles = fs.readdirSync(join(tempDir, "backups")).filter((f) => f.endsWith(".sqlite"));
    expect(primaryFiles.length).toBe(1);
    const secondaryFiles = fs.readdirSync(secondary).filter((f) => f.endsWith(".sqlite"));
    expect(secondaryFiles.length).toBe(1);
  });

  it("when primary write throws, returns a BackupLog with status=failed and error populated and does NOT throw", async () => {
    queryRawShouldThrow = { error: "disk full" };
    const log = await runBackup({ kind: "manual" });

    expect(log.status).toBe("failed");
    expect(log.error).toContain("disk full");
    // labSettings.update should NOT have been called for failed primary
    expect(fakePrisma.labSettings.update).not.toHaveBeenCalled();
  });

  // The primary copy lives on the same disk as the live database, so the
  // off-machine copy is the one that survives a disk failure. Reporting the run
  // as a plain success when that copy silently failed tells the owner they are
  // protected when they are not.
  describe("when the off-machine copy fails", () => {
    it("does not report the run as a success", async () => {
      queryRawShouldThrow = { match: "unwritable", error: "no such volume" };

      const log = await runBackup({
        kind: "auto",
        secondaryPath: join(tempDir, "unwritable"),
        verify: passes,
      });

      expect(log.status).not.toBe("success");
    });

    it("names the off-machine failure in the returned log", async () => {
      queryRawShouldThrow = { match: "unwritable", error: "no such volume" };

      const log = await runBackup({
        kind: "auto",
        secondaryPath: join(tempDir, "unwritable"),
        verify: passes,
      });

      expect(log.error).toContain("no such volume");
    });

    it("still keeps the primary copy it managed to write", async () => {
      queryRawShouldThrow = { match: "unwritable", error: "no such volume" };

      await runBackup({ kind: "auto", secondaryPath: join(tempDir, "unwritable"), verify: passes });

      const files = fs.readdirSync(join(tempDir, "backups")).filter((f) => f.endsWith(".sqlite"));
      expect(files.length).toBe(1);
    });
  });

  // A backup nothing has read back is a guess, not a backup. VACUUM INTO
  // succeeding only means bytes were written without an error — a disk that
  // fills mid-write or a failing USB stick still leaves a plausible file that
  // the old code logged as a clean success.
  describe("when the written backup cannot be read back", () => {
    it("does not report the run as a success", async () => {
      const log = await runBackup({ kind: "manual", verify: fails });

      expect(log.status).not.toBe("success");
    });

    it("names the verification failure in the log", async () => {
      const log = await runBackup({ kind: "manual", verify: fails });

      expect(log.error).toContain("not a database");
    });

    // lastBackupAt is what the scheduler and the UI both read to decide the lab
    // is protected. An unreadable file must not move it.
    it("does not record the lab as backed up", async () => {
      await runBackup({ kind: "manual", verify: fails });

      expect(fakePrisma.labSettings.update).not.toHaveBeenCalled();
    });

    it("reports a success once the backup verifies", async () => {
      const log = await runBackup({ kind: "manual", verify: passes });

      expect(log.status).toBe("success");
      expect(fakePrisma.labSettings.update).toHaveBeenCalled();
    });

    // The off-machine copy is the one that survives the disk dying, so a USB
    // stick that writes garbage is exactly the case worth catching.
    it("does not report a success when only the off-machine copy is unreadable", async () => {
      const secondary = fs.mkdtempSync(join(os.tmpdir(), "lab-backup-bad-"));
      const verify = async (path: string) =>
        path.startsWith(secondary)
          ? ({ ok: false, reason: "usb stick is failing" } as const)
          : ({ ok: true, rows: 42 } as const);

      const log = await runBackup({ kind: "auto", secondaryPath: secondary, verify });

      expect(log.status).not.toBe("success");
      expect(log.error).toContain("usb stick is failing");
    });
  });
});

// The scheduler used to fire only when the clock string equalled backupTime
// exactly, checked once a minute, with the "already ran" marker held in memory.
// If the app was not running at 02:00 — PC off, app closed, machine asleep, or
// the tick simply drifting past the minute — that day had no backup at all and
// nothing ever caught up. On a lab whose only master copy is one SQLite file,
// that is silent data-loss exposure.
describe("isBackupDue", () => {
  const at = (iso: string) => new Date(iso);

  it("is due when the lab has never been backed up", () => {
    expect(isBackupDue(at("2026-07-27T02:30:00"), "02:00", null)).toBe(true);
  });

  it("is not due before the scheduled time", () => {
    expect(isBackupDue(at("2026-07-27T01:30:00"), "02:00", at("2026-07-26T02:05:00"))).toBe(false);
  });

  it("is due at the scheduled time", () => {
    expect(isBackupDue(at("2026-07-27T02:00:00"), "02:00", at("2026-07-26T02:05:00"))).toBe(true);
  });

  it("is not due again once today's backup has run", () => {
    expect(isBackupDue(at("2026-07-27T05:00:00"), "02:00", at("2026-07-27T02:05:00"))).toBe(false);
  });

  // The core fix: the owner opens the app at 09:00 having missed 02:00 entirely.
  it("catches up when the scheduled time was missed", () => {
    expect(isBackupDue(at("2026-07-27T09:00:00"), "02:00", at("2026-07-26T02:05:00"))).toBe(true);
  });

  it("catches up after the machine was off for days", () => {
    expect(isBackupDue(at("2026-07-27T09:00:00"), "02:00", at("2026-07-20T02:05:00"))).toBe(true);
  });

  it("does not fire on an unparseable backupTime", () => {
    expect(isBackupDue(at("2026-07-27T09:00:00"), "nonsense", null)).toBe(false);
  });
});

// A backup that keeps failing (full disk, missing volume) is still due, so
// without a throttle the once-a-minute scheduler would retry it 1,440 times a
// day and fill BackupLog with identical failures. It should keep retrying — just
// not every minute.
describe("shouldAttemptAfterFailure", () => {
  const at = (iso: string) => new Date(iso);

  it("allows the first attempt when none has been made", () => {
    expect(shouldAttemptAfterFailure(at("2026-07-27T09:00:00"), null)).toBe(true);
  });

  it("does not retry immediately after a failure", () => {
    expect(
      shouldAttemptAfterFailure(at("2026-07-27T09:01:00"), at("2026-07-27T09:00:00")),
    ).toBe(false);
  });

  it("retries once the back-off has elapsed", () => {
    expect(
      shouldAttemptAfterFailure(at("2026-07-27T10:00:00"), at("2026-07-27T09:00:00")),
    ).toBe(true);
  });
});

describe("pruneOld", () => {
  it("removes lab-*.sqlite files older than the cutoff and preserves newer + non-lab files", async () => {
    const dir = join(tempDir, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const oldFile = join(dir, "lab-20200101-0000.sqlite");
    const newFile = join(dir, "lab-99990101-0000.sqlite");
    const otherFile = join(dir, "preserve-me.txt");
    fs.writeFileSync(oldFile, "old");
    fs.writeFileSync(newFile, "new");
    fs.writeFileSync(otherFile, "preserve");

    // Set old file mtime to 30 days ago
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    fs.utimesSync(oldFile, new Date(thirtyDaysAgo), new Date(thirtyDaysAgo));
    // Set new file mtime to now (already)
    fs.utimesSync(newFile, new Date(), new Date());

    const removed = pruneOld(14);

    expect(removed).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
    expect(fs.existsSync(otherFile)).toBe(true);
  });

  // runBackup accepts a custom filenamePrefix, but pruning only matched "lab-",
  // so any backup written under another prefix accumulated forever.
  it("also prunes old backups written with a custom filename prefix", () => {
    const dir = join(tempDir, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const oldCustom = join(dir, "pre-restore-20200101-0000.sqlite");
    fs.writeFileSync(oldCustom, "old");
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    fs.utimesSync(oldCustom, new Date(thirtyDaysAgo), new Date(thirtyDaysAgo));

    const removed = pruneOld(14);

    expect(removed).toBe(1);
    expect(fs.existsSync(oldCustom)).toBe(false);
  });

  it("still leaves non-backup files alone", () => {
    const dir = join(tempDir, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const notes = join(dir, "notes.txt");
    fs.writeFileSync(notes, "keep me");
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    fs.utimesSync(notes, new Date(thirtyDaysAgo), new Date(thirtyDaysAgo));

    pruneOld(14);

    expect(fs.existsSync(notes)).toBe(true);
  });
});
