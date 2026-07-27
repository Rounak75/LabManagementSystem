// Integration test against real SQLite. A backup is only worth logging as a
// success if something has actually opened it and read data back out, so these
// tests use a real Prisma connection and real VACUUM INTO output rather than a
// fake that would happily "verify" a text file.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";

import { verifyBackup } from "../backup.service";

let tempDir: string;
let live: PrismaClient;
let query: (sql: string) => Promise<unknown>;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(join(os.tmpdir(), "lab-verify-test-"));
  const livePath = join(tempDir, "live.sqlite");
  live = new PrismaClient({ datasources: { db: { url: `file:${livePath}` } } });
  query = (sql: string) => live.$queryRawUnsafe(sql);

  // A minimal stand-in for the real schema: verifyBackup only needs a table it
  // can count, and building the whole schema here would test Prisma, not this.
  await live.$executeRawUnsafe(`CREATE TABLE "Patient" (id TEXT PRIMARY KEY, name TEXT)`);
  await live.$executeRawUnsafe(`INSERT INTO "Patient" (id, name) VALUES ('p1','A'),('p2','B'),('p3','C')`);
});

afterAll(async () => {
  await live.$disconnect();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

let counter = 0;
let backupPath: string;

beforeEach(async () => {
  backupPath = join(tempDir, `backup-${++counter}.sqlite`);
});

async function writeRealBackup(): Promise<void> {
  await live.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);
}

describe("verifyBackup", () => {
  it("accepts a backup that VACUUM INTO actually wrote", async () => {
    await writeRealBackup();

    const result = await verifyBackup(backupPath, { query });

    expect(result.ok).toBe(true);
  });

  it("reports the row count it read back out of the backup", async () => {
    await writeRealBackup();

    const result = await verifyBackup(backupPath, { query });

    expect(result).toMatchObject({ ok: true, rows: 3 });
  });

  // The failure this whole finding is about: a file exists, has a plausible
  // size, and is logged as a good backup — but nothing can read it.
  it("rejects a file that is not a SQLite database at all", async () => {
    fs.writeFileSync(backupPath, "this is not a database");

    const result = await verifyBackup(backupPath, { query });

    expect(result.ok).toBe(false);
  });

  it("rejects a truncated database", async () => {
    await writeRealBackup();
    const full = fs.readFileSync(backupPath);
    fs.writeFileSync(backupPath, full.subarray(0, Math.floor(full.length / 2)));

    const result = await verifyBackup(backupPath, { query });

    expect(result.ok).toBe(false);
  });

  it("rejects a zero-length file", async () => {
    fs.writeFileSync(backupPath, "");

    const result = await verifyBackup(backupPath, { query });

    expect(result.ok).toBe(false);
  });

  it("rejects a file that does not exist", async () => {
    const result = await verifyBackup(join(tempDir, "nope.sqlite"), { query });

    expect(result.ok).toBe(false);
  });

  // If a failed verification left the database attached, every later backup on
  // this connection would fail with "database backup_verify is already in use"
  // — turning one bad backup into a permanently broken backup system.
  it("detaches after a failure so later verifications still work", async () => {
    fs.writeFileSync(backupPath, "not a database");
    await verifyBackup(backupPath, { query });

    const second = join(tempDir, `backup-after-failure.sqlite`);
    await live.$executeRawUnsafe(`VACUUM INTO '${second}'`);

    expect(await verifyBackup(second, { query })).toMatchObject({ ok: true });
  });

  it("gives a reason when it rejects a backup", async () => {
    fs.writeFileSync(backupPath, "not a database");

    const result = await verifyBackup(backupPath, { query });

    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBeTruthy();
  });
});
