import { describe, it, expect, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { withSingleConnection } from "@lab/db";
import { applySqlitePragmas } from "../sqlite-pragmas";

// These run against a real SQLite file on purpose. The bug this module exists to
// fix — `PRAGMA journal_mode=WAL` returning a row, which $executeRawUnsafe
// rejects — is a real-SQLite behaviour. A mocked client would have happily
// reproduced the author's assumption and passed while the lab ran without WAL
// for months, which is exactly what happened.

const tmpDirs: string[] = [];

function freshDb(): { db: PrismaClient; dir: string } {
  const dir = fs.mkdtempSync(join(os.tmpdir(), "pragma-test-"));
  tmpDirs.push(dir);
  const file = join(dir, "test.sqlite");
  // `synchronous` is per-connection. Read back over a multi-connection pool it
  // reports whatever the connection that answered was set to, not what
  // applySqlitePragmas just did — so this pins the pool the way the app does.
  const db = new PrismaClient({
    datasources: { db: { url: withSingleConnection(`file:${file}`) } },
  });
  return { db, dir };
}

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

async function readPragma(db: PrismaClient, name: string): Promise<string> {
  const rows = (await db.$queryRawUnsafe(`PRAGMA ${name}`)) as Record<string, unknown>[];
  return String(Object.values(rows?.[0] ?? {})[0]);
}

describe("applySqlitePragmas against real SQLite", () => {
  it("actually leaves the database in WAL mode", async () => {
    const { db } = freshDb();
    await applySqlitePragmas(db);

    // Note this passes under the old buggy code too: SQLite applies the pragma
    // and only then does Prisma reject the returned rows, so WAL was in fact on.
    // Kept as a regression pin on the end state, not as the test that catches
    // the bug — that is the synchronous pair below.
    expect(await readPragma(db, "journal_mode")).toBe("wal");
    await db.$disconnect();
  });

  it("reports what it did", async () => {
    const { db } = freshDb();
    const result = await applySqlitePragmas(db);
    expect(result).toEqual({ journalMode: "wal", synchronousRelaxed: true });
    await db.$disconnect();
  });

  it("relaxes synchronous to NORMAL once WAL is on", async () => {
    const { db } = freshDb();
    await applySqlitePragmas(db);
    // 0=OFF 1=NORMAL 2=FULL 3=EXTRA
    expect(await readPragma(db, "synchronous")).toBe("1");
    await db.$disconnect();
  });

  it("is safe to run on every boot", async () => {
    const { db } = freshDb();
    await applySqlitePragmas(db);
    const second = await applySqlitePragmas(db);
    expect(second.journalMode).toBe("wal");
    expect(await readPragma(db, "journal_mode")).toBe("wal");
    await db.$disconnect();
  });
});

// The failure paths cannot be provoked with a real local file, so they use a
// stub. What matters here is the safety rule, not the SQL.
describe("applySqlitePragmas when WAL cannot be enabled", () => {
  function stub(journalResult: unknown | Error) {
    const calls: string[] = [];
    return {
      calls,
      client: {
        $queryRawUnsafe: vi.fn(async (sql: string) => {
          calls.push(sql);
          if (/journal_mode/i.test(sql)) {
            if (journalResult instanceof Error) throw journalResult;
            return journalResult;
          }
          return [];
        }),
        $executeRawUnsafe: vi.fn(async (sql: string) => {
          calls.push(sql);
          return 0;
        }),
      },
    };
  }

  // The important one. In WAL, synchronous=NORMAL can lose the most recent
  // transactions on power loss but cannot corrupt the file. In the default
  // rollback-journal mode it CAN corrupt it. This database is the lab's only
  // master copy on a home PC with no UPS, so if WAL did not take, synchronous
  // must stay at FULL rather than being relaxed anyway.
  it("does NOT relax synchronous when SQLite refused WAL", async () => {
    const s = stub([{ journal_mode: "delete" }]);
    const result = await applySqlitePragmas(s.client);

    expect(result).toEqual({ journalMode: "delete", synchronousRelaxed: false });
    expect(s.calls.some((c) => /synchronous/i.test(c))).toBe(false);
  });

  it("does NOT relax synchronous when the journal_mode statement throws", async () => {
    const s = stub(new Error("Execute returned results, which is not allowed in SQLite."));
    const result = await applySqlitePragmas(s.client);

    expect(result.synchronousRelaxed).toBe(false);
    expect(s.calls.some((c) => /synchronous/i.test(c))).toBe(false);
  });

  it("never throws — a pragma failure must not stop the app booting", async () => {
    const s = stub(new Error("disk I/O error"));
    await expect(applySqlitePragmas(s.client)).resolves.toBeDefined();
  });

  it("surfaces the failure to the caller so it can be logged, not just swallowed", async () => {
    const onError = vi.fn();
    const s = stub(new Error("boom"));
    await applySqlitePragmas(s.client, { onError });

    // The original bug survived because the only trace was a console.warn that
    // nobody was watching. The caller must be told.
    expect(onError).toHaveBeenCalledOnce();
    expect(String(onError.mock.calls[0]![0])).toMatch(/boom/);
  });

  it("treats an unreadable journal_mode result as failure rather than assuming success", async () => {
    const s = stub([]);
    const result = await applySqlitePragmas(s.client);
    expect(result.journalMode).toBe("unknown");
    expect(result.synchronousRelaxed).toBe(false);
  });
});
