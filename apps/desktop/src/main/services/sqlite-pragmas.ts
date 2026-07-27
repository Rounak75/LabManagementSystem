/**
 * Puts the local database into WAL mode at boot.
 *
 * This used to live inline in db.ts as two `$executeRawUnsafe` calls in one try
 * block, and it had never once worked:
 *
 *     PRAGMA journal_mode=WAL   -- returns a row: [{ journal_mode: "wal" }]
 *
 * `$executeRawUnsafe` is for statements that return a row *count*. Handed one
 * that returns a result set, Prisma throws P2010 ("Execute returned results,
 * which is not allowed in SQLite").
 *
 * The damage is subtler than it first looks, and worth stating precisely because
 * the error message is misleading. SQLite *does* apply the pragma — it is only
 * afterwards that Prisma rejects the rows it handed back. Measured on a real
 * database: after the old code ran, `journal_mode` was `wal` and `synchronous`
 * was `2` (FULL). So WAL was never the casualty.
 *
 * What was lost is the second line. Both pragmas shared one try block, so the
 * throw skipped `synchronous=NORMAL` entirely, leaving every commit to fsync the
 * WAL. That is the cost the setting existed to avoid, on the machine that writes
 * a sync tick every five seconds. And the catch only did a `console.warn`, so
 * the sole evidence was a scary-looking stack trace on stdout that appeared to
 * be about WAL and was labelled non-fatal — which is why it survived this long.
 *
 * Three things this gets right that the original did not:
 *
 *   1. `$queryRawUnsafe` for journal_mode, because it returns a row.
 *   2. The result is *checked*. SQLite does not error when it declines to switch
 *      — on a network share or an in-memory database it just returns the mode it
 *      kept. Assuming success is how this stayed hidden.
 *   3. `synchronous=NORMAL` is applied only once WAL is confirmed. In WAL that
 *      setting can cost the most recent transactions on power loss but cannot
 *      corrupt the file; under a rollback journal it can corrupt it. This file is
 *      the lab's only master copy, on a home PC in Jamshedpur with no UPS, so
 *      when WAL does not take, FULL is what it stays on.
 */

/**
 * The slice of a Prisma client this needs. Keeps the module testable with a stub.
 *
 * `$queryRawUnsafe` is deliberately not generic here: this module treats the
 * result as opaque and narrows it through `firstScalar`, and a generic signature
 * would force every test stub to be generic too for no gain.
 */
export interface RawSqliteClient {
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
  $executeRawUnsafe: (sql: string) => Promise<number>;
}

export interface PragmaOutcome {
  /** The journal mode SQLite reports *after* the attempt, or "unknown". */
  journalMode: string;
  /** Whether synchronous was lowered to NORMAL. False whenever WAL is not on. */
  synchronousRelaxed: boolean;
}

export interface PragmaOptions {
  /**
   * Called with any error. db.ts routes this to logError so it lands in
   * lab-errors.log — the original only reached stdout, which is why nobody
   * noticed for months.
   */
  onError?: (err: unknown) => void;
}

/** Reads the single scalar out of a `PRAGMA` result set. */
function firstScalar(rows: unknown): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (row === null || typeof row !== "object") return null;
  const value = Object.values(row as Record<string, unknown>)[0];
  return value === undefined || value === null ? null : String(value);
}

export async function applySqlitePragmas(
  db: RawSqliteClient,
  opts: PragmaOptions = {},
): Promise<PragmaOutcome> {
  let journalMode = "unknown";

  try {
    // Returns a row. This is the whole bug.
    const rows = await db.$queryRawUnsafe("PRAGMA journal_mode=WAL");
    journalMode = firstScalar(rows)?.toLowerCase() ?? "unknown";
  } catch (err) {
    opts.onError?.(err);
    return { journalMode: "unknown", synchronousRelaxed: false };
  }

  if (journalMode !== "wal") {
    // Not an exception — SQLite declining to switch is a normal, reportable
    // outcome (network share, in-memory db, an open connection in another mode).
    opts.onError?.(
      new Error(
        `SQLite kept journal_mode="${journalMode}" instead of switching to WAL; ` +
          `leaving synchronous at FULL.`,
      ),
    );
    return { journalMode, synchronousRelaxed: false };
  }

  try {
    // Returns no rows, so $executeRawUnsafe is correct here.
    await db.$executeRawUnsafe("PRAGMA synchronous=NORMAL");
    return { journalMode, synchronousRelaxed: true };
  } catch (err) {
    // WAL is on, which is the bulk of the benefit. FULL is merely slower.
    opts.onError?.(err);
    return { journalMode, synchronousRelaxed: false };
  }
}
