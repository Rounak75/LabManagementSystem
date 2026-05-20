import { unstable_cache } from "next/cache";
import { getServerSupabase } from "./supabase-client";

export interface AuditEntry {
  id: string;
  timestamp: string;
  user_id: string;
  action: string;
  target_entity: string;
  target_id: string;
  details: string | null;
  userName: string | null;
}

// audit_logs.user_id has no FK to users, so a PostgREST embed isn't available —
// fetch the rows, then resolve the referenced user names in a second query.
// Audit logs are append-only and written by many routes; rather than tag every
// writer, cache briefly with time-based revalidation. The log viewer tolerates a
// few seconds of staleness.
const _listAuditLogs = unstable_cache(
  async (
    jwt: string,
    limit: number,
    filters?: { action?: string; userId?: string },
  ): Promise<AuditEntry[]> => {
    const sb = getServerSupabase(jwt);
    let q = sb
      .from("audit_logs")
      .select("id, timestamp, user_id, action, target_entity, target_id, details")
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (filters?.action) q = q.eq("action", filters.action);
    if (filters?.userId) q = q.eq("user_id", filters.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Omit<AuditEntry, "userName">[];

    const names = await resolveUserNames(jwt, rows.map((r) => r.user_id));
    return rows.map((r) => ({ ...r, userName: names.get(r.user_id) ?? null }));
  },
  ["audit-logs"],
  { revalidate: 20 },
);

export function listAuditLogs(
  jwt: string,
  limit = 200,
  filters?: { action?: string; userId?: string },
): Promise<AuditEntry[]> {
  return _listAuditLogs(jwt, limit, filters);
}

export async function resolveUserNames(jwt: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const sb = getServerSupabase(jwt);
  const { data } = await sb.from("users").select("id, name, username").in("id", ids);
  for (const u of data ?? []) map.set(u.id as string, (u.name as string) ?? (u.username as string) ?? "");
  return map;
}

const _listDistinctAuditActions = unstable_cache(
  async (jwt: string): Promise<string[]> => {
    const sb = getServerSupabase(jwt);
    const { data, error } = await sb.from("audit_logs").select("action").limit(1000);
    if (error) return [];
    return Array.from(new Set((data ?? []).map((r) => r.action as string))).sort();
  },
  ["audit-actions"],
  { revalidate: 300 },
);

export function listDistinctAuditActions(jwt: string): Promise<string[]> {
  return _listDistinctAuditActions(jwt);
}
