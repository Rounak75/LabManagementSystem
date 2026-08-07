import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { applyPendingMigrations } from "../../apply-migrations";

/**
 * Retention for the per-tick telemetry table, against a real database.
 *
 * `SyncTickLog` gets a row on every sync tick — every 5s while the lab is busy,
 * every 60s when it is idle — and nothing ever deleted one. On the machine
 * holding the lab's only master copy that is a table that grows forever, and it
 * is copied in full by every `VACUUM INTO` backup.
 *
 * The whole behaviour here is a date comparison, so a mocked Prisma would only
 * prove that `deleteMany` was called with an object of the right shape. Whether
 * that shape actually selects the intended rows — and only those — is the part
 * that can be wrong, and only a real database answers it.
 */

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => "." } }));

const holder = vi.hoisted(() => ({ client: null as unknown as PrismaClient }));
vi.mock("@main/db", () => ({ prisma: () => holder.client }));

import {
  pruneTickLog,
  shouldPruneTickLog,
  TICK_LOG_RETENTION_DAYS,
  TICK_LOG_PRUNE_INTERVAL_MS,
} from "../tick-log";

const MIGRATIONS_DIR = join(process.cwd(), "../../packages/db/prisma/migrations");
const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "lab-ticklog-int-"));
const tmpDb = join(tmpDir, "test.sqlite");

const DAY_MS = 24 * 60 * 60 * 1000;

let db: PrismaClient;

beforeAll(async () => {
  db = new PrismaClient({ datasources: { db: { url: "file:" + tmpDb } } });
  holder.client = db;
  await applyPendingMigrations(db as never, MIGRATIONS_DIR);
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(async () => {
  await db.syncTickLog.deleteMany();
});

/** A telemetry row stamped a given number of days before `now`. */
async function tickLogAgedDays(days: number, now: Date): Promise<string> {
  const row = await db.syncTickLog.create({
    data: {
      pushed: 0,
      pulled: 0,
      failed: 0,
      durationMs: 12,
      errors: "[]",
      createdAt: new Date(now.getTime() - days * DAY_MS),
    },
  });
  return row.id;
}

describe("pruneTickLog", () => {
  it("deletes telemetry older than the retention window", async () => {
    const now = new Date("2026-08-07T10:00:00.000Z");
    await tickLogAgedDays(TICK_LOG_RETENTION_DAYS + 1, now);

    const deleted = await pruneTickLog(now);

    expect(deleted).toBe(1);
    expect(await db.syncTickLog.count()).toBe(0);
  });

  it("keeps telemetry inside the retention window", async () => {
    const now = new Date("2026-08-07T10:00:00.000Z");
    const keptId = await tickLogAgedDays(TICK_LOG_RETENTION_DAYS - 1, now);

    const deleted = await pruneTickLog(now);

    expect(deleted).toBe(0);
    const remaining = await db.syncTickLog.findMany({ select: { id: true } });
    expect(remaining.map((r) => r.id)).toEqual([keptId]);
  });

  // The failure that would matter most: a cutoff computed the wrong way round,
  // or in the wrong unit, wiping the telemetry someone is mid-diagnosis on.
  it("removes only the rows past the cutoff when both kinds are present", async () => {
    const now = new Date("2026-08-07T10:00:00.000Z");
    await tickLogAgedDays(TICK_LOG_RETENTION_DAYS + 10, now);
    await tickLogAgedDays(TICK_LOG_RETENTION_DAYS + 1, now);
    const freshId = await tickLogAgedDays(0, now);
    const recentId = await tickLogAgedDays(1, now);

    const deleted = await pruneTickLog(now);

    expect(deleted).toBe(2);
    const remaining = await db.syncTickLog.findMany({
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    expect(remaining.map((r) => r.id)).toEqual([freshId, recentId]);
  });

  it("is a no-op on an empty table", async () => {
    expect(await pruneTickLog(new Date())).toBe(0);
  });
});

describe("shouldPruneTickLog", () => {
  // A sweep on every tick would be a second write transaction every 5s on the
  // master database, to delete nothing almost every time.
  it("does not sweep again inside the interval", () => {
    const last = 1_000_000;
    expect(shouldPruneTickLog(last, last + TICK_LOG_PRUNE_INTERVAL_MS - 1)).toBe(false);
  });

  it("sweeps once the interval has elapsed", () => {
    const last = 1_000_000;
    expect(shouldPruneTickLog(last, last + TICK_LOG_PRUNE_INTERVAL_MS)).toBe(true);
  });

  // Zero is the module's "never swept" starting value, so the first tick after
  // the app launches always sweeps — which is when a long accumulation is most
  // likely to be sitting there.
  it("sweeps on the first tick after startup", () => {
    expect(shouldPruneTickLog(0, Date.now())).toBe(true);
  });
});
