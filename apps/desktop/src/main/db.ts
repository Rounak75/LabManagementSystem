import { app } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import { getPrisma } from "@lab/db";
import { outboxExtension } from "@main/services/cloud/prisma-hooks";

let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _extended: any | null = null;

/**
 * Run pending Prisma migrations against the live database.
 * Uses `prisma migrate deploy` which is safe for production —
 * it only applies migrations that haven't been applied yet.
 */
function runMigrations(dbUrl: string): void {
  const schemaDir = app.isPackaged
    ? join(process.resourcesPath, "prisma")
    : join(__dirname, "../../../../packages/db/prisma");
  const schemaPath = join(schemaDir, "schema.prisma");

  if (!existsSync(schemaPath)) {
    console.warn("[DB] schema.prisma not found at", schemaPath, "— skipping migrations");
    return;
  }

  try {
    console.log("[DB] Running prisma migrate deploy …");
    const result = execSync(
      `npx prisma migrate deploy --schema "${schemaPath}"`,
      { env: { ...process.env, DATABASE_URL: dbUrl }, timeout: 30_000, encoding: "utf-8" }
    );
    console.log("[DB] Migrations applied:", result);
  } catch (err: any) {
    // Log but don't crash — the app may still work if the DB is already up-to-date
    console.error("[DB] Migration error (non-fatal):", err.stderr || err.message);
  }
}

export function initDatabase() {
  if (initialized) return;
  const userData = app.getPath("userData");
  console.log("[DB] userData:", userData);
  if (!existsSync(userData)) mkdirSync(userData, { recursive: true });
  const dbPath = join(userData, "lab.sqlite");
  console.log("[DB] dbPath:", dbPath, "exists:", existsSync(dbPath));

  // First-run: copy the migrated dev.sqlite from packages/db/prisma into userData if absent.
  if (!existsSync(dbPath)) {
    const seed = app.isPackaged
      ? join(process.resourcesPath, "lab.sqlite")
      : join(__dirname, "../../../../packages/db/prisma/dev.sqlite");
    console.log("[DB] seed path:", seed, "exists:", existsSync(seed));
    if (existsSync(seed)) copyFileSync(seed, dbPath);
    else console.log("[DB] WARNING: seed file not found, creating empty db");
  }

  const dbUrl = `file:${dbPath}`;
  console.log("[DB] DATABASE_URL:", dbUrl);
  process.env.DATABASE_URL = dbUrl;

  // Apply any pending migrations before initializing Prisma client
  runMigrations(dbUrl);

  const base = getPrisma(dbUrl);
  _extended = base.$extends(outboxExtension);
  initialized = true;
}

export const prisma = () => (_extended ?? getPrisma()) as ReturnType<typeof getPrisma>;
