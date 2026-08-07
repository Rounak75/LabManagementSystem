import { PrismaClient } from "@prisma/client";
export { PrismaClient, Prisma } from "@prisma/client";

/**
 * Pins a SQLite URL to a single connection.
 *
 * SQLite keeps `ATTACH` and most `PRAGMA` settings per *connection*, but
 * Prisma's default pool opens `cpus * 2 + 1` of them and hands each query
 * whichever one is free. Two things in this app depend on that state surviving
 * from one query to the next, and neither did:
 *
 *   - `applySqlitePragmas` sets `synchronous=NORMAL` at boot. Measured against
 *     a real database on the default URL, 30 of 40 concurrent reads still
 *     reported `2` (FULL) — the pragma only ever reached the one connection it
 *     was issued on, so most commits kept fsyncing the WAL. That is the exact
 *     cost the pragma exists to avoid.
 *   - `verifyBackup` ATTACHes the backup, then reads it. On the default URL
 *     only 29 of 40 follow-up queries could see the attached database, so a
 *     *good* backup could be logged as "could not be read back".
 *
 * With `connection_limit=1` both measured 40/40. One connection is also the
 * right shape here: this is a single-user desktop app against a local file, and
 * SQLite serialises writes regardless.
 */
export function withSingleConnection(url: string): string {
  if (!url.startsWith("file:")) return url;
  if (/[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=1`;
}

let _client: PrismaClient | null = null;
export function getPrisma(databaseUrl?: string): PrismaClient {
  if (_client) return _client;
  _client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: withSingleConnection(databaseUrl) } } } : undefined,
  );
  return _client;
}
export async function disconnect() {
  if (_client) { await _client.$disconnect(); _client = null; }
}
