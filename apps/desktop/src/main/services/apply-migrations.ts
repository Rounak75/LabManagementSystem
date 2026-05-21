import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createHash, randomUUID } from "crypto";

/**
 * In-process Prisma migration applier for SQLite.
 *
 * Why this exists: `npx prisma migrate deploy` does not work in a packaged
 * Electron app (no npx on the user's machine, engine/schema paths don't
 * resolve). Without this, an auto-update that ships new migrations would never
 * apply them to an existing install's database. This applies pending
 * migrations using the already-bundled Prisma client + the bundled migration
 * SQL files — works identically in dev and in the packaged app.
 *
 * Verified safe for THIS project's migrations: they are plain DDL (CREATE/ALTER/
 * DROP/INDEX) + PRAGMA + INSERT...SELECT, with no triggers or procedural
 * (BEGIN…END) blocks, so splitting on ';' is correct. Prisma's
 * `$executeRawUnsafe` runs a single statement per call, so we must split.
 */

type RawClient = {
  $executeRawUnsafe: (sql: string) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(sql: string) => Promise<T>;
};

/** Migration folder names (prisma `<timestamp>_<name>`), sorted ascending. */
export function listMigrationFolders(migrationsDir: string): string[] {
  try {
    return readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
  } catch {
    return [];
  }
}

/** Split a Prisma SQLite migration into individual executable statements. */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/**
 * Apply any migration folders not already recorded in `_prisma_migrations`.
 * Returns the names of migrations newly applied. Records bookkeeping (with a
 * Prisma-compatible sha256 checksum) only after a migration's statements all
 * succeed. Throws if a statement fails (caller decides how to surface it).
 */
export async function applyPendingMigrations(client: RawClient, migrationsDir: string): Promise<string[]> {
  const folders = listMigrationFolders(migrationsDir);
  if (folders.length === 0) return [];

  await client.$executeRawUnsafe(CREATE_MIGRATIONS_TABLE);
  const rows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const applied = new Set(rows.map((r) => r.migration_name));

  const newly: string[] = [];
  for (const folder of folders) {
    if (applied.has(folder)) continue;
    const sql = readFileSync(join(migrationsDir, folder, "migration.sql"), "utf8");
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      await client.$executeRawUnsafe(stmt);
    }
    const checksum = createHash("sha256").update(sql).digest("hex");
    const now = new Date().toISOString();
    await client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
       VALUES ('${randomUUID()}','${checksum}','${now}','${folder}','${now}',${statements.length})`,
    );
    newly.push(folder);
  }
  return newly;
}
