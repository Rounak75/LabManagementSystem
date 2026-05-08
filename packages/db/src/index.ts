import { PrismaClient } from "@prisma/client";
export { PrismaClient, Prisma } from "@prisma/client";

let _client: PrismaClient | null = null;
export function getPrisma(databaseUrl?: string): PrismaClient {
  if (_client) return _client;
  _client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
  return _client;
}
export async function disconnect() {
  if (_client) { await _client.$disconnect(); _client = null; }
}
