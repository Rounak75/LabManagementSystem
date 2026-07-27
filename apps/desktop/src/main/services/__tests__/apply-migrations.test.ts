import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { splitSqlStatements, listMigrationFolders, applyPendingMigrations } from "../apply-migrations";

// process.cwd() is apps/desktop when vitest runs; migrations live at repo root.
const MIGRATIONS_DIR = join(process.cwd(), "../../packages/db/prisma/migrations");

describe("splitSqlStatements", () => {
  it("strips -- comments and splits on semicolons", () => {
    const sql = `-- a comment\nCREATE TABLE a (x INTEGER);\n-- another\nCREATE INDEX i ON a(x);`;
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE a (x INTEGER)", "CREATE INDEX i ON a(x)"]);
  });
  it("drops trailing empties and whitespace-only fragments", () => {
    expect(splitSqlStatements("PRAGMA foreign_keys=OFF;\n\n  ;\n")).toEqual(["PRAGMA foreign_keys=OFF"]);
  });

  // Splitting naively on ';' is correct only for the SQL this project happens to
  // contain today. The next migration with a semicolon in a default value, or a
  // trigger body, would be silently cut in half and applied as garbage.
  it("keeps a semicolon inside a string literal in one statement", () => {
    const sql = `INSERT INTO t (a) VALUES ('one; two');`;
    expect(splitSqlStatements(sql)).toEqual([`INSERT INTO t (a) VALUES ('one; two')`]);
  });

  it("handles doubled single quotes inside a literal", () => {
    const sql = `INSERT INTO t (a) VALUES ('it''s; fine');`;
    expect(splitSqlStatements(sql)).toEqual([`INSERT INTO t (a) VALUES ('it''s; fine')`]);
  });

  it("keeps a semicolon inside a quoted identifier in one statement", () => {
    const sql = `CREATE TABLE "odd;name" (x INTEGER);`;
    expect(splitSqlStatements(sql)).toEqual([`CREATE TABLE "odd;name" (x INTEGER)`]);
  });

  it("keeps a trigger's BEGIN…END body as a single statement", () => {
    const sql = [
      "CREATE TRIGGER t AFTER INSERT ON a",
      "BEGIN",
      "  UPDATE a SET x = 1;",
      "  UPDATE a SET y = 2;",
      "END;",
      "CREATE INDEX i ON a(x);",
    ].join("\n");

    const statements = splitSqlStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("UPDATE a SET y = 2;");
    expect(statements[0]!.endsWith("END")).toBe(true);
    expect(statements[1]).toBe("CREATE INDEX i ON a(x)");
  });

  it("does not treat a -- inside a string literal as a comment", () => {
    const sql = `INSERT INTO t (a) VALUES ('a -- b');`;
    expect(splitSqlStatements(sql)).toEqual([`INSERT INTO t (a) VALUES ('a -- b')`]);
  });
});

describe("listMigrationFolders", () => {
  it("returns the real migration folders sorted", () => {
    const folders = listMigrationFolders(MIGRATIONS_DIR);
    expect(folders.length).toBeGreaterThanOrEqual(10);
    expect([...folders]).toEqual([...folders].sort());
    expect(folders.every((f) => /^\d{14}_/.test(f))).toBe(true);
  });
  it("returns [] for a missing dir", () => {
    expect(listMigrationFolders(join(os.tmpdir(), "does-not-exist-xyz"))).toEqual([]);
  });
});

describe("applyPendingMigrations (integration, real SQLite)", () => {
  const tmpDb = join(fs.mkdtempSync(join(os.tmpdir(), "lab-applymig-")), "test.sqlite");
  const prisma = new PrismaClient({ datasources: { db: { url: "file:" + tmpDb } } });

  afterAll(async () => {
    await prisma.$disconnect();
    try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ }
  });

  it("applies every migration to a fresh DB and builds the schema", async () => {
    const expected = listMigrationFolders(MIGRATIONS_DIR);
    const applied = await applyPendingMigrations(prisma as any, MIGRATIONS_DIR);
    expect(applied).toEqual(expected);

    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const names = tables.map((t) => t.name);
    // spot-check core tables exist after applying the real migration history
    for (const t of ["Patient", "Visit", "VisitTest", "TestResult", "Invoice", "User"]) {
      expect(names).toContain(t);
    }
  });

  // Statements were applied one at a time with no transaction, and the
  // bookkeeping row was written only after all of them succeeded. A failure
  // half-way left a partly-migrated schema AND no record of the attempt, so the
  // next boot retried from statement 1 and failed on "already exists" — stuck
  // permanently, against a schema the app then ran on anyway.
  it("rolls back every statement when a later one fails", async () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), "lab-badmig-"));
    const folder = join(dir, "20990101000001_broken");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      join(folder, "migration.sql"),
      [
        'CREATE TABLE "should_not_survive" (x INTEGER);',
        "THIS IS NOT VALID SQL;",
      ].join("\n"),
    );

    await expect(applyPendingMigrations(prisma as never, dir)).rejects.toThrow();

    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='should_not_survive'",
    );
    expect(tables).toHaveLength(0);
  });

  it("does not record a failed migration as applied", async () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), "lab-badmig2-"));
    const folder = join(dir, "20990101000002_broken");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(join(folder, "migration.sql"), "THIS IS NOT VALID SQL;");

    await expect(applyPendingMigrations(prisma as never, dir)).rejects.toThrow();

    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*) as c FROM "_prisma_migrations" WHERE migration_name = '20990101000002_broken'`,
    );
    expect(Number(rows[0]?.c)).toBe(0);
  });

  it("is idempotent — a second run applies nothing", async () => {
    const applied = await applyPendingMigrations(prisma as any, MIGRATIONS_DIR);
    expect(applied).toEqual([]);
    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      'SELECT COUNT(*) as c FROM "_prisma_migrations"',
    );
    expect(Number(rows[0]?.c)).toBe(listMigrationFolders(MIGRATIONS_DIR).length);
  });
});
