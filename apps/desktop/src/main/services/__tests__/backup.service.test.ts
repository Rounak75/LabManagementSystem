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

import { runBackup, pruneOld } from "../backup.service";

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
    const log = await runBackup({ kind: "manual" });

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
    await runBackup({ kind: "manual", secondaryPath: secondary });

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
});
