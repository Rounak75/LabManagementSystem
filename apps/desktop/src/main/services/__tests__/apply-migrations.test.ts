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

  it("is idempotent — a second run applies nothing", async () => {
    const applied = await applyPendingMigrations(prisma as any, MIGRATIONS_DIR);
    expect(applied).toEqual([]);
    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      'SELECT COUNT(*) as c FROM "_prisma_migrations"',
    );
    expect(Number(rows[0]?.c)).toBe(listMigrationFolders(MIGRATIONS_DIR).length);
  });
});
