import { app } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { getPrisma } from "@lab/db";
import { outboxExtension } from "@main/services/cloud/prisma-hooks";
import { applyPendingMigrations } from "@main/services/apply-migrations";
import { applySqlitePragmas } from "@main/services/sqlite-pragmas";
import { logError } from "@main/services/logger";

let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _extended: any | null = null;

export async function initDatabase() {
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

  const base = getPrisma(dbUrl);

  // WAL + relaxed sync. Persistent once set; safe to run every boot.
  // Failures are reported into the error log rather than only stdout — the
  // previous version's console.warn is why a broken pragma went unnoticed.
  const pragmas = await applySqlitePragmas(base, {
    onError: (err) => logError("db:pragma", err),
  });
  console.log(
    `[DB] journal_mode=${pragmas.journalMode} synchronous=${pragmas.synchronousRelaxed ? "NORMAL" : "FULL"}`,
  );

  // Apply pending migrations IN-PROCESS (works in dev AND the packaged app, unlike
  // `npx prisma migrate deploy` which can't run on an end-user machine). This is
  // what makes an auto-update that ships new migrations actually take effect.
  const migrationsDir = app.isPackaged
    ? join(process.resourcesPath, "prisma", "migrations")
    : join(__dirname, "../../../../packages/db/prisma/migrations");
  // Deliberately fatal. This used to be swallowed as "non-fatal", so an
  // auto-update that shipped a migration which failed to apply started the app
  // anyway against a schema that did not match the code — the worst outcome for
  // the machine holding the lab's only master copy, and invisible to the owner.
  // A failed migration is now rolled back (see applyPendingMigrations) and
  // rethrown, so boot stops with the fatal dialog instead of running on a schema
  // the release does not expect.
  const applied = await applyPendingMigrations(base, migrationsDir);
  if (applied.length) console.log("[DB] applied migrations:", applied.join(", "));
  else console.log("[DB] migrations already up to date");

  _extended = base.$extends(outboxExtension);
  initialized = true;
}

export const prisma = () => (_extended ?? getPrisma()) as ReturnType<typeof getPrisma>;
