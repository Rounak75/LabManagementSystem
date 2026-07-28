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
 * refuses to hand it over if it contains any operational data. Run by
 * `package:win` / `release:win` before electron-builder.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const PRISMA_DIR = resolve(__dirname, "..", "prisma");
const SEED_DB = join(PRISMA_DIR, "seed.sqlite");
const SEED_URL = `file:${SEED_DB}`;

/** Tables that must be empty in a database shipped to a new lab. */
const MUST_BE_EMPTY = [
  "Patient",
  "Visit",
  "VisitTest",
  "TestResult",
  "Invoice",
  "User",
  "AuditLog",
  "Outbox",
  "Booking",
] as const;

/**
 * The npm CLI runner, named for the platform we are on.
 *
 * On Windows there is no file called `npx` — the shim is `npx.cmd`. `execFileSync`
 * hands the name straight to CreateProcess, which does not apply PATHEXT, so it
 * looks for a literal `npx`, fails to find one, and the whole packaging run dies
 * before it starts:
 *
 *   [seed-db] failed: spawnSync npx ENOENT
 *
 * Since `package:win` is the *only* way anyone builds the installer, and that
 * only ever happens on Windows, this script could never have produced a release
 * on the machine it was written for.
 *
 * `shell: true` would also work and is the more common workaround, but it would
 * put these arguments through cmd.exe's parser — and one of them is a path
 * containing spaces ("Lab Management System"). Naming the executable correctly
 * keeps the arguments out of a shell entirely.
 */
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command: string, args: string[]): void {
  execFileSync(command, args, {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: SEED_URL },
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = SEED_DB + suffix;
    if (existsSync(path)) rmSync(path, { force: true });
  }

  console.log(`[seed-db] building fresh database at ${SEED_DB}`);
  run(NPX, ["prisma", "migrate", "deploy"]);
  run(NPX, ["tsx", "src/seed.ts"]);

  const prisma = new PrismaClient({ datasources: { db: { url: SEED_URL } } });
  try {
    const offenders: string[] = [];
    for (const table of MUST_BE_EMPTY) {
      const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
        `SELECT COUNT(*) as c FROM "${table}"`,
      );
      const count = Number(rows[0]?.c ?? 0);
      if (count > 0) offenders.push(`${table} (${count})`);
    }

    if (offenders.length > 0) {
      throw new Error(
        `Refusing to ship a seed database containing operational data: ${offenders.join(", ")}. ` +
          `This file is copied onto the lab's PC as its starting database.`,
      );
    }

    const tests = await prisma.test.count();
    const doctors = await prisma.doctor.count();
    console.log(`[seed-db] ready — ${tests} tests, ${doctors} doctors, no patient data`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-db] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
