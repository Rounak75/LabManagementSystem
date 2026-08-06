import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { applyPendingMigrations } from "../../apply-migrations";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

/**
 * The pull cursor, against a real migrated database.
 *
 * The rest of this directory mocks Prisma, so it proves runPull calls
 * `syncCursor.upsert` with the right object and proves nothing about what SQLite
 * then stores or hands back. That is exactly where this bug lived: the cursor
 * round-tripped through a `DateTime`, which holds milliseconds, while Supabase's
 * `updated_at` holds microseconds. The next query asked for `updated_at >
 * '...715Z'` when the boundary row was '...715022' — still greater — so every
 * stream re-fetched and re-applied its newest row on every tick, forever. On the
 * lab's machine that was one orphaned result retried 7,089 times and one invoice
 * re-pushed to Supabase every five seconds for nine days.
 *
 * A mocked cursor cannot lose precision, so a mocked test cannot see any of it.
 * These run against the real schema, which also proves the migration adding
 * `lastCursorValue` applies.
 */

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => "." } }));

const holder = vi.hoisted(() => ({ client: null as unknown as PrismaClient }));
vi.mock("@main/db", () => ({ prisma: () => holder.client }));

import { runPull } from "../pull-runner";

const MIGRATIONS_DIR = join(process.cwd(), "../../packages/db/prisma/migrations");
const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "lab-cursor-int-"));
const tmpDb = join(tmpDir, "test.sqlite");

/** A Postgres timestamp as PostgREST actually returns it: microseconds, +00:00. */
const MICROSECONDS = "2026-07-28T08:12:32.715022+00:00";

/**
 * An ISO timestamp as microseconds since the epoch.
 *
 * The fake cloud has to compare `since` against a row the way Postgres would.
 * Comparing the strings is not the same thing — '...715Z' sorts *after*
 * '...715022+00:00' because 'Z' outranks '0' — and a fake that gets that wrong
 * reports the bug fixed while the boundary row is silently never returned.
 * `Date.parse` is no use either: it is millisecond-precision, which is the very
 * thing under test.
 */
function micros(iso: string): number {
  const fraction = (/\.(\d+)/.exec(iso)?.[1] ?? "").padEnd(6, "0").slice(0, 6);
  return Date.parse(iso.replace(/\.\d+/, "")) * 1000 + Number(fraction);
}

/** A cloud that honours the cursor: a row is returned only while `since` is strictly below it. */
function cloudHolding(rows: { id: string; updated_at: string }[]) {
  return makeFakeCloudClient({
    pullSince: vi.fn(async (_table: string, _column: string, since: string) =>
      rows.filter((r) => micros(since) < micros(r.updated_at)),
    ),
  });
}

let db: PrismaClient;

beforeAll(async () => {
  db = new PrismaClient({ datasources: { db: { url: "file:" + tmpDb } } });
  holder.client = db;
  await applyPendingMigrations(db as never, MIGRATIONS_DIR);
});

afterAll(async () => {
  await db.$disconnect();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(async () => {
  await db.syncDeadLetter.deleteMany();
  await db.syncCursor.deleteMany();
});

const spec = (applyRow: (r: Record<string, unknown>) => Promise<void> = async () => {}) => ({
  source: "widgets",
  table: "widgets",
  cursorColumn: "updated_at",
  applyRow,
});

describe("the pull cursor against real SQLite", () => {
  it("stores a microsecond timestamp without rounding it", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([{ id: "w1", updated_at: MICROSECONDS }]),
    });

    await runPull(cloud, spec());

    const saved = await db.syncCursor.findUnique({ where: { source: "widgets" } });
    expect(saved?.lastCursorValue).toBe(MICROSECONDS);
  });

  it("asks the cloud again from that exact value, so the row is not re-fetched", async () => {
    const first = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([{ id: "w1", updated_at: MICROSECONDS }]),
    });
    await runPull(first, spec());

    const second = makeFakeCloudClient();
    await runPull(second, spec());

    const [, , since] = second.pullSince.mock.calls[0]!;
    expect(since).toBe(MICROSECONDS);
  });

  it("applies a row once across repeated passes rather than on every tick", async () => {
    const applied: string[] = [];
    const cloud = cloudHolding([{ id: "w1", updated_at: MICROSECONDS }]);
    const record = spec(async (r) => void applied.push(String(r.id)));

    await runPull(cloud, record);
    await runPull(cloud, record);
    await runPull(cloud, record);

    expect(applied).toEqual(["w1"]);
  });

  it("falls back to lastSyncedAt for a cursor written before the column existed", async () => {
    await db.syncCursor.create({
      data: {
        source: "widgets",
        lastSyncedAt: new Date("2026-07-28T08:12:32.715Z"),
        lastId: "w0",
      },
    });
    const cloud = makeFakeCloudClient();

    await runPull(cloud, spec());

    const [, , since, , , lastId] = cloud.pullSince.mock.calls[0]!;
    expect(since).toBe("2026-07-28T08:12:32.715Z");
    expect(lastId).toBe("w0");
  });

  // The upgrade path for a machine that is already stuck. Its cursor holds only
  // the truncated DateTime, so the first pass after the update re-fetches the
  // boundary row one last time — and must come out of it holding the raw value,
  // or the loop simply resumes.
  it("heals a cursor that is already parked on the row it keeps re-fetching", async () => {
    await db.syncCursor.create({
      data: {
        source: "widgets",
        lastSyncedAt: new Date("2026-07-28T08:12:32.715Z"),
        lastId: "w1",
      },
    });
    const cloud = cloudHolding([{ id: "w1", updated_at: MICROSECONDS }]);
    const applied: string[] = [];
    const record = spec(async (r) => void applied.push(String(r.id)));

    await runPull(cloud, record);
    await runPull(cloud, record);
    await runPull(cloud, record);

    // Once on the first pass while the cursor was still the truncated one, then
    // never again.
    expect(applied).toEqual(["w1"]);
    const saved = await db.syncCursor.findUnique({ where: { source: "widgets" } });
    expect(saved?.lastCursorValue).toBe(MICROSECONDS);
  });

  it("leaves a quarantined row to the replayer instead of retrying it every pass", async () => {
    await db.syncDeadLetter.create({
      data: {
        source: "widgets",
        rowId: "orphan",
        payload: JSON.stringify({ id: "orphan" }),
        error: "no parameter",
        attempts: 3,
        // Well inside the replay cooldown, so the replayer will not pick it up
        // either — this pass should touch it not at all.
        lastSeenAt: new Date(),
      },
    });
    const applyRow = vi.fn().mockRejectedValue(new Error("no parameter"));
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([{ id: "orphan", updated_at: MICROSECONDS }]),
    });

    await runPull(cloud, spec(applyRow));

    expect(applyRow).not.toHaveBeenCalled();
    const entry = await db.syncDeadLetter.findUnique({
      where: { source_rowId: { source: "widgets", rowId: "orphan" } },
    });
    // Its attempt count is a record of what the pull did; skipping is not an
    // attempt, and must not inflate it.
    expect(entry?.attempts).toBe(3);
  });
});
