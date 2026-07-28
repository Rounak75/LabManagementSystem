/**
 * Builds the seed database that ships inside the installer.
 *
 * electron-builder used to copy `prisma/dev.sqlite` — the developer's own working
 * database — into the installer as `lab.sqlite`, and db.ts copies that file into
 * userData on first run. Whatever happened to be in the dev database at package
 * time therefore became the lab's starting data: test patients, real patients
 * imported while debugging, dev admin accounts with known passwords. Nothing
 * scrubbed it and nothing checked.
 *
 * This builds a fresh database from the migrations plus the intended seed, then
 * refuses to hand it over unless it contains exactly the seed data and nothing
 * else. Run by `package:win` / `release:win` before electron-builder.
 */

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const PKG_DIR = resolve(__dirname, "..");
const PRISMA_DIR = join(PKG_DIR, "prisma");
const SEED_DB = join(PRISMA_DIR, "seed.sqlite");
/** Prisma's SQLite connector wants forward slashes even on Windows. */
const SEED_URL = `file:${SEED_DB.replace(/\\/g, "/")}`;

const IS_WINDOWS = process.platform === "win32";

/**
 * Tables the seed is allowed to populate. Every other table in the schema must
 * be empty — an allowlist rather than a denylist, so a model added later is
 * covered by default instead of silently exempt from the check.
 */
const SEEDED_TABLES = new Set([
  "Doctor",
  "Test",
  "TestParameter",
  "LabSettings",
  "ReportTemplate",
]);

/** Bookkeeping tables that legitimately hold rows in a fresh database. */
const IGNORED_TABLES = new Set(["_prisma_migrations"]);

function removeSeedDatabase(): void {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    rmSync(SEED_DB + suffix, { force: true });
  }
}

function run(command: string, args: string[]): void {
  // On Windows there is no bare `npx` — only `npx.cmd`, which execFileSync will
  // not find without the extension, and which Node refuses to spawn without a
  // shell since the 18.20.1/20.12.1 security fix. This script only ever runs
  // from `package:win` / `release:win`, so getting this wrong breaks every build.
  execFileSync(IS_WINDOWS ? `${command}.cmd` : command, args, {
    cwd: PKG_DIR,
    env: { ...process.env, DATABASE_URL: SEED_URL },
    stdio: "inherit",
    shell: IS_WINDOWS,
  });
}

/** Fails if any non-seed table has rows. */
async function assertNoOperationalData(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite%'
    ORDER BY name
  `;

  const offenders: string[] = [];
  for (const { name } of tables) {
    if (SEEDED_TABLES.has(name) || IGNORED_TABLES.has(name)) continue;
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
      `SELECT COUNT(*) as c FROM "${name}"`,
    );
    const count = Number(rows[0]?.c ?? 0);
    if (count > 0) offenders.push(`${name} (${count})`);
  }

  if (offenders.length > 0) {
    throw new Error(
      `Refusing to ship a seed database containing operational data: ${offenders.join(", ")}. ` +
        `This file is copied onto the lab's PC as its starting database.`,
    );
  }
}

/**
 * Fails if the seed did not produce what first run depends on. An empty database
 * passes the emptiness check above but leaves the lab with no tests to order and
 * no report template to print.
 */
async function assertSeedDataPresent(prisma: PrismaClient): Promise<{ tests: number; doctors: number }> {
  const [tests, doctors, templates, selfDoctor, settings] = await Promise.all([
    prisma.test.count(),
    prisma.doctor.count(),
    prisma.reportTemplate.count(),
    prisma.doctor.findUnique({ where: { id: "doctor-self" } }),
    prisma.labSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const missing: string[] = [];
  if (tests === 0) missing.push("no tests");
  if (templates === 0) missing.push("no report template");
  // Patient and visit creation default referredById to this row; without it
  // every patient the lab registers fails on a foreign key.
  if (!selfDoctor) missing.push(`no "doctor-self" row`);
  if (!settings) missing.push("no LabSettings singleton");
  else if (!settings.defaultTemplateId) missing.push("LabSettings.defaultTemplateId is null");

  if (missing.length > 0) {
    throw new Error(
      `Refusing to ship an incomplete seed database: ${missing.join(", ")}. ` +
        `Check that src/seed.ts ran against ${SEED_DB}.`,
    );
  }

  return { tests, doctors };
}

async function main(): Promise<void> {
  removeSeedDatabase();

  console.log(`[seed-db] building fresh database at ${SEED_DB}`);
  run("npx", ["prisma", "migrate", "deploy"]);
  run("npx", ["tsx", "src/seed.ts"]);

  const prisma = new PrismaClient({ datasources: { db: { url: SEED_URL } } });
  let summary: { tests: number; doctors: number };
  try {
    await assertNoOperationalData(prisma);
    summary = await assertSeedDataPresent(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const { tests, doctors } = summary;
  console.log(
    `[seed-db] ready — ${tests} tests, ${doctors} ${doctors === 1 ? "doctor" : "doctors"}, no patient data`,
  );
}

main().catch((err) => {
  console.error("[seed-db] failed:", err instanceof Error ? err.message : err);
  // electron-builder copies prisma/seed.sqlite unconditionally. Leaving a
  // rejected database on disk means a later `electron-builder` run — one that
  // does not go through package:win — would ship the very file this script just
  // refused. Deleting it turns that into a missing-resource build failure.
  removeSeedDatabase();
  process.exit(1);
});
