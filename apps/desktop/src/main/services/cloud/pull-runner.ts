// Shared driver for the cloud→local pull handlers.
//
// Every pull module had the same ~40-line skeleton: read cursor, fetch a page,
// loop rows, advance cursor. Six near-identical copies meant the same two bugs
// six times over:
//
//  1. A row that failed to apply for any reason other than P2002/P2003 was
//     rethrown, which skipped the cursor write at the end of the function. The
//     next tick re-fetched the identical page, hit the same row, and rethrew
//     again — every 5 seconds, indefinitely. One bad row stopped every later row
//     in that stream from ever reaching the lab PC, and nothing in the UI said
//     so. Here a repeatedly-failing row is retried a bounded number of times and
//     then quarantined in SyncDeadLetter so the cursor can move past it.
//
//  2. The cloud fetch was wrapped in a catch that logged and returned. That is
//     right for "cloud unreachable", but it also swallowed programming errors —
//     a renamed client method threw TypeError and looked exactly like an offline
//     blip, so sync silently did nothing. Fetch errors now propagate to the
//     engine, which records them per handler and surfaces them.

import { prisma } from "@main/db";
import { logger } from "./logger";
import type { CloudClient } from "./sync-engine";

/** How many ticks a failing row is retried before it is quarantined. */
export const MAX_ROW_ATTEMPTS = 3;

const DEFAULT_BATCH_SIZE = 100;

export interface PullStats {
  applied: number;
  skipped: number;
  failed: number;
}

export interface PullSpec<TRow extends Record<string, unknown>> {
  /** Handler name; also the SyncCursor and SyncDeadLetter key. */
  source: string;
  /** Cloud table to read. */
  table: string;
  /** Timestamp column the cursor walks. */
  cursorColumn: string;
  /** Equality filters applied to the cloud query. */
  filters?: Record<string, string>;
  batchSize?: number;
  /**
   * Decides whether a row is ours to apply. Returning false skips the row but
   * still advances the cursor — used to ignore rows this desktop pushed itself,
   * and soft-deleted rows.
   */
  shouldApply?: (row: TRow) => boolean;
  /**
   * Applies one row to local SQLite.
   *
   * Returning normally means "this row is dealt with" and **advances the cursor
   * past it forever**. It does not mean "skip for now". Three handlers have
   * returned early meaning the latter — for a payment whose invoice had not
   * arrived, and a verification whose visit had not — and in each case the row
   * was silently dropped: money the patient had handed over vanished from the
   * lab PC, and a verified visit never reached the Reports list to be printed.
   * Both carried a comment claiming a later tick would retry.
   *
   * If a row cannot be applied *yet*, throw. It is retried for a few ticks and
   * then quarantined in SyncDeadLetter, where it is visible and replayable. Only
   * return early when the row genuinely needs nothing done — already applied,
   * superseded by newer local data, or deliberately rejected.
   */
  applyRow: (row: TRow) => Promise<void>;
  /**
   * Called with every row in the page before any is applied, for handlers that
   * need to batch their own lookups (avoiding N+1 reads per row).
   */
  prepare?: (rows: TRow[]) => Promise<void>;
}

/**
 * Runs one pull pass: fetch a page from `since`, apply each row, then advance the
 * cursor. Returns per-row counts. Throws only if the cloud fetch itself fails.
 */
export async function runPull<TRow extends Record<string, unknown>>(
  client: CloudClient,
  spec: PullSpec<TRow>,
): Promise<PullStats> {
  const { source, table, cursorColumn } = spec;
  const batchSize = spec.batchSize ?? DEFAULT_BATCH_SIZE;

  const cursor = await prisma().syncCursor.findUnique({ where: { source } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  // Deliberately unguarded: a fetch failure is the engine's to report. Swallowing
  // it here is what made a renamed client method indistinguishable from offline.
  const rows = (await client.pullSince(
    table,
    cursorColumn,
    sinceIso,
    batchSize,
    spec.filters,
    lastId,
  )) as unknown as TRow[];

  const stats: PullStats = { applied: 0, skipped: 0, failed: 0 };

  // Give anything previously quarantined another go before this page. Whatever
  // blocked it may since have arrived or been fixed by an update.
  await replayDeadLetters(spec, stats);

  if (rows.length === 0) return stats;

  if (spec.prepare) await spec.prepare(rows);

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;
  let blocked = false;

  for (const row of rows) {
    const rowId = String(row.id ?? "");
    const rowCursor = row[cursorColumn];
    const advance = () => {
      // Only move the cursor while no earlier row in this page is still being
      // retried — otherwise we would skip past the row we mean to retry.
      if (blocked) return;
      // The cursor is a (timestamp, id) pair used for tie-breaking. A row with no
      // usable timestamp cannot position it: moving the id alone would leave the
      // cursor at a position that never existed and could skip rows sharing that
      // timestamp. Such a row is left for a later tick to resolve.
      if (typeof rowCursor !== "string" && !(rowCursor instanceof Date)) return;
      latest = new Date(rowCursor as string);
      latestId = rowId;
    };

    try {
      if (spec.shouldApply && !spec.shouldApply(row)) {
        stats.skipped += 1;
        advance();
        continue;
      }

      await spec.applyRow(row);
      stats.applied += 1;
      await clearDeadLetter(source, rowId);
      advance();
    } catch (err) {
      stats.failed += 1;
      const attempts = await recordDeadLetter(source, rowId, row, err);

      if (attempts >= MAX_ROW_ATTEMPTS) {
        logger.error(
          "cloud",
          `[${source}] row ${rowId} failed ${attempts}x — quarantining and moving on`,
          err,
        );
        advance();
      } else {
        // Give a possibly-transient failure another tick, and hold the cursor so
        // the row is re-fetched. Later rows in this page are still attempted.
        logger.warn(
          "cloud",
          `[${source}] row ${rowId} failed (attempt ${attempts}/${MAX_ROW_ATTEMPTS}) — will retry`,
        );
        blocked = true;
      }
    }
  }

  if (latestId !== (cursor?.lastId ?? null) || latest.getTime() !== (cursor?.lastSyncedAt?.getTime() ?? 0)) {
    await prisma().syncCursor.upsert({
      where: { source },
      update: { lastSyncedAt: latest, lastId: latestId },
      create: { source, lastSyncedAt: latest, lastId: latestId },
    });
  }

  return stats;
}

/** How many quarantined rows one pass re-attempts. */
const REPLAY_LIMIT = 20;

/**
 * Re-attempts rows that were quarantined earlier.
 *
 * Quarantining lets the cursor move past a row that will not apply, so one bad
 * row cannot stop the stream. The cost is that the row is then behind the
 * cursor: once the reason it failed is fixed — a parent that has since synced, a
 * bug in the handler corrected by an update — nothing ever looked at it again,
 * and the work it carried was gone for good. A quarantined result is a value a
 * staff member typed for a patient.
 *
 * The payload is stored with the dead letter, so replaying needs no cursor and
 * no cloud round-trip. A row that fails again simply stays quarantined.
 */
async function replayDeadLetters<TRow extends Record<string, unknown>>(
  spec: PullSpec<TRow>,
  stats: PullStats,
): Promise<void> {
  const stuck = await prisma().syncDeadLetter.findMany({
    where: { source: spec.source, resolvedAt: null },
    orderBy: { lastSeenAt: "asc" },
    take: REPLAY_LIMIT,
  });

  for (const entry of stuck) {
    let row: TRow;
    try {
      row = JSON.parse(entry.payload) as TRow;
    } catch {
      continue; // nothing recoverable stored; leave it for a human
    }

    try {
      if (spec.shouldApply && !spec.shouldApply(row)) {
        await clearDeadLetter(spec.source, entry.rowId);
        continue;
      }
      await spec.applyRow(row);
      await clearDeadLetter(spec.source, entry.rowId);
      stats.applied += 1;
      logger.info("cloud", `[${spec.source}] quarantined row ${entry.rowId} applied on replay`);
    } catch {
      // Still failing. It keeps its place in the dead-letter table rather than
      // being counted as a fresh failure, so the attempt count stays meaningful.
    }
  }
}

/** Records or re-counts a failing row. Returns how many times it has now failed. */
async function recordDeadLetter(
  source: string,
  rowId: string,
  row: unknown,
  err: unknown,
): Promise<number> {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const existing = await prisma().syncDeadLetter.findUnique({
    where: { source_rowId: { source, rowId } },
  });
  const attempts = (existing?.attempts ?? 0) + 1;

  await prisma().syncDeadLetter.upsert({
    where: { source_rowId: { source, rowId } },
    create: {
      source,
      rowId,
      payload: JSON.stringify(row),
      error: message,
      attempts,
    },
    update: {
      payload: JSON.stringify(row),
      error: message,
      attempts,
      lastSeenAt: new Date(),
      resolvedAt: null,
    },
  });

  return attempts;
}

/** Marks a previously-failing row resolved once it applies. */
async function clearDeadLetter(source: string, rowId: string): Promise<void> {
  const existing = await prisma().syncDeadLetter.findUnique({
    where: { source_rowId: { source, rowId } },
  });
  if (!existing || existing.resolvedAt) return;

  await prisma().syncDeadLetter.upsert({
    where: { source_rowId: { source, rowId } },
    create: { source, rowId, payload: "null", error: "", attempts: 0, resolvedAt: new Date() },
    update: { resolvedAt: new Date() },
  });
}
