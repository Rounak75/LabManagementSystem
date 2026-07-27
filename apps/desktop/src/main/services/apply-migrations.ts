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

/**
 * Splits a migration into individually executable statements.
 *
 * Splitting on every ';' was correct only for the SQL this project happened to
 * contain. A semicolon inside a string literal or a trigger's BEGIN…END body
 * would be cut in half and the fragments applied as garbage — a landmine for the
 * next migration rather than a present bug. This walks the text instead, so
 * semicolons inside literals, quoted identifiers and block bodies are left alone.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);

  let current = "";
  let blockDepth = 0; // BEGIN…END / CASE…END nesting
  let i = 0;

  const readQuoted = (quote: string) => {
    current += quote;
    i++;
    while (i < sql.length) {
      // A doubled quote is an escaped quote, not the end of the literal.
      if (sql[i] === quote && sql[i + 1] === quote) {
        current += quote + quote;
        i += 2;
        continue;
      }
      if (sql[i] === quote) {
        current += quote;
        i++;
        return;
      }
      current += sql[i];
      i++;
    }
  };

  while (i < sql.length) {
    const ch = sql[i]!;

    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      readQuoted(ch);
      continue;
    }
    if (isWordChar(ch)) {
      let word = "";
      while (i < sql.length && isWordChar(sql[i])) {
        word += sql[i];
        i++;
      }
      current += word;
      const upper = word.toUpperCase();
      // Statement-terminating semicolons inside a trigger body belong to the body.
      if (upper === "BEGIN" || upper === "CASE") blockDepth++;
      else if (upper === "END") blockDepth = Math.max(0, blockDepth - 1);
      continue;
    }
    if (ch === ";" && blockDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }

  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

/** `PRAGMA foreign_keys=…` — a no-op inside a transaction, so run it outside. */
const FOREIGN_KEY_PRAGMA = /^PRAGMA\s+foreign_keys\s*=/i;

/** Raised when a migration could not be applied. The schema is left untouched. */
export class MigrationFailedError extends Error {
  constructor(
    readonly migrationName: string,
    readonly cause: unknown,
  ) {
    super(
      `Migration ${migrationName} failed and was rolled back: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "MigrationFailedError";
  }
}

const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

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

    // `PRAGMA foreign_keys` does nothing inside a transaction, and Prisma's older
    // SQLite migrations rely on it being off while a table is rebuilt. Run those
    // outside the transaction; everything else goes inside it.
    const pragmas = statements.filter((s) => FOREIGN_KEY_PRAGMA.test(s));
    const body = statements.filter((s) => !FOREIGN_KEY_PRAGMA.test(s));
    const disablePragmas = pragmas.filter((p) => /off/i.test(p));
    const restorePragmas = pragmas.filter((p) => !/off/i.test(p));

    const checksum = createHash("sha256").update(sql).digest("hex");
    const now = new Date().toISOString();

    for (const pragma of disablePragmas) await client.$executeRawUnsafe(pragma);

    // One transaction per migration. Previously each statement was applied on its
    // own and the bookkeeping row written only after all of them succeeded, so a
    // failure half-way left a partly-migrated schema with no record of the
    // attempt: the next boot retried from statement 1, failed on "already
    // exists", and stayed stuck there forever while the app ran on the broken
    // schema regardless. Recording the migration inside the same transaction
    // makes the schema change and its bookkeeping commit or vanish together.
    await client.$executeRawUnsafe("BEGIN");
    try {
      for (const stmt of body) {
        await client.$executeRawUnsafe(stmt);
      }
      await client.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
         VALUES (${sqlLiteral(randomUUID())},${sqlLiteral(checksum)},${sqlLiteral(now)},${sqlLiteral(folder)},${sqlLiteral(now)},${body.length})`,
      );
      await client.$executeRawUnsafe("COMMIT");
    } catch (err) {
      try {
        await client.$executeRawUnsafe("ROLLBACK");
      } catch {
        /* the transaction may already have been aborted */
      }
      throw new MigrationFailedError(folder, err);
    } finally {
      for (const pragma of restorePragmas) {
        try {
          await client.$executeRawUnsafe(pragma);
        } catch {
          /* restoring the pragma must not mask the original failure */
        }
      }
    }

    newly.push(folder);
  }
  return newly;
}
