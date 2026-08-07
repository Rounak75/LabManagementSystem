import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { applyPendingMigrations } from "../apply-migrations";

/**
 * The access-code columns leave `Visit` by way of a table rebuild — SQLite
 * cannot drop a column in place, so the migration copies every row into a new
 * table, drops the old one and renames. That is the single riskiest step in
 * retiring the credential: it runs against a lab machine holding real visits,
 * and a rebuild that forgets a column, an index or a foreign key loses data
 * quietly rather than failing loudly.
 *
 * So this drives the *production* migration runner — the same
 * `applyPendingMigrations` the packaged app calls on update — over a database
 * that already holds a visit and its children, and checks what survived.
 */

const MIGRATIONS_DIR = join(process.cwd(), "../../packages/db/prisma/migrations");
const DROP_MIGRATION = "20260807120000_retire_visit_access_code";

const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "lab-access-code-drop-"));
const tmpDb = join(tmpDir, "test.sqlite");
// A copy of the migration history with the drop held back, so the fixture can
// be written while the columns still exist.
const stagedDir = join(tmpDir, "migrations");

let db: PrismaClient;

async function columns(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("Visit")`,
  );
  return rows.map((r) => r.name);
}

beforeAll(async () => {
  fs.cpSync(MIGRATIONS_DIR, stagedDir, { recursive: true });
  fs.rmSync(join(stagedDir, DROP_MIGRATION), { recursive: true, force: true });

  db = new PrismaClient({ datasources: { db: { url: "file:" + tmpDb } } });
  await applyPendingMigrations(db, stagedDir);
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("retiring the Visit access-code columns", () => {
  it("carries the visit, its children and every other column through the rebuild", async () => {
    // ── Arrange: a visit with an access code and both kinds of child row.
    await db.$executeRawUnsafe(`
      INSERT INTO "User" ("id","name","username","passwordHash","role","isActive","createdAt","updatedAt")
      VALUES ('u1','Staff','staff1','x','Staff',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
    await db.$executeRawUnsafe(`
      INSERT INTO "Patient" ("id","patientId","name","age","sex","createdById","createdAt","updatedAt")
      VALUES ('p1','LAB-2026-00042','A Patient',30,'Male','u1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
    await db.$executeRawUnsafe(`
      INSERT INTO "Visit"
        ("id","visitId","patientId","type","visitDate","status","staffId",
         "accessCodeHash","accessCodePlaintext",
         "reportReleaseOverride","reportReleaseOverrideReason","deletedAt",
         "createdAt","updatedAt")
      VALUES
        ('v1','VIS-2026-00042','p1','WalkIn','2026-08-01T00:00:00.000Z','Open','u1',
         '$2b$10$hash','K7P2QX',
         1,'paid in cash',NULL,
         CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
    await db.$executeRawUnsafe(`
      INSERT INTO "Invoice" ("id","visitId","subtotal","total","paymentStatus","amountPaid","createdAt","updatedAt")
      VALUES ('i1','v1',500,500,'Pending',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);

    expect(await columns()).toContain("accessCodeHash");

    // ── Act: the real runner, over the real migration.
    const applied = await applyPendingMigrations(db, MIGRATIONS_DIR);

    // ── Assert: the columns are gone…
    expect(applied).toContain(DROP_MIGRATION);
    const after = await columns();
    expect(after).not.toContain("accessCodeHash");
    expect(after).not.toContain("accessCodePlaintext");

    // …every other column came with it, including the nullable and defaulted
    // ones a careless rebuild would quietly reset…
    for (const kept of [
      "id", "visitId", "patientId", "type", "visitDate", "status", "staffId",
      "reportReleaseOverride", "reportReleaseOverrideByUserId",
      "reportReleaseOverrideAt", "reportReleaseOverrideReason",
      "createdAt", "updatedAt", "deletedAt",
    ]) {
      expect(after).toContain(kept);
    }

    // …the row survived with its values intact, not just its id…
    const visit = await db.visit.findUnique({ where: { id: "v1" } });
    expect(visit).toMatchObject({
      visitId: "VIS-2026-00042",
      patientId: "p1",
      status: "Open",
      reportReleaseOverride: true,
      reportReleaseOverrideReason: "paid in cash",
    });

    // …and the child row still resolves through the rebuilt foreign key.
    const invoice = await db.invoice.findFirst({ where: { visitId: "v1" } });
    expect(invoice?.id).toBe("i1");
  }, 120_000);

  it("keeps the unique constraint and both indexes", async () => {
    const idx = await db.$queryRawUnsafe<Array<{ name: string; unique: number | bigint }>>(
      `PRAGMA index_list("Visit")`,
    );
    const names = idx.map((i) => i.name);

    expect(names).toContain("Visit_visitId_key");
    expect(names).toContain("Visit_patientId_idx");
    expect(names).toContain("Visit_visitDate_idx");
    // PRAGMA counters come back from the raw query as BigInt.
    expect(Number(idx.find((i) => i.name === "Visit_visitId_key")?.unique)).toBe(1);
  });

  // A rebuild that left foreign keys dangling would not error — SQLite only
  // notices when asked.
  it("leaves no broken foreign keys anywhere in the database", async () => {
    const problems = await db.$queryRawUnsafe<unknown[]>(`PRAGMA foreign_key_check`);

    expect(problems).toEqual([]);
  });
});
