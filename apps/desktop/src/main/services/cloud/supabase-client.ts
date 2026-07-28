import { logger } from "./logger";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type {
  ClassifiedSupabaseError,
  SupabaseConfig,
  PaymentEventRow,
  FreeTierStatusRow,
} from "./types";

// ─── classifyError ─────────────────────────────────────────────────────────────

/**
 * Classify a Supabase error object (or native Error) into a
 * ClassifiedSupabaseError.  The input may be:
 *  - A Supabase PostgREST error  { status: number; message?: string }
 *  - A native Error (network / unreachable)
 *  - Any unknown value without a numeric status (treated as network error)
 */
export function classifyError(err: unknown): ClassifiedSupabaseError {
  const asObj = err as Record<string, unknown> | null | undefined;

  // PostgREST/Postgres error from a failed query (missing column, FK violation,
  // RLS denial, etc). PostgrestError extends Error and carries a NON-EMPTY string
  // `code` (SQLSTATE like "23503" or PostgREST like "PGRST204") plus `details`/
  // `hint` — but NO numeric `status`. It MUST be classified here, before the
  // generic `instanceof Error` branch below, otherwise every schema/FK/permission
  // failure is mis-read as a transient network error and retried for ~6 hours.
  //
  // CAUTION: when fetch itself fails (connect timeout, DNS, offline), postgrest-js
  // returns an object of the SAME shape but with an EMPTY `code` (`{ message:
  // 'TypeError: fetch failed', details: <stack>, hint: '', code: '' }`). That is a
  // genuine network failure and MUST stay retryable — so require a non-empty code
  // here, otherwise real connectivity blips get marked Failed and never recover.
  const code = typeof asObj?.code === "string" ? (asObj.code as string) : "";
  const isPostgrest =
    !!asObj &&
    code !== "" &&
    (asObj.name === "PostgrestError" || ("details" in asObj && "hint" in asObj));

  if (isPostgrest) {
    const baseMsg =
      typeof asObj!.message === "string" && asObj!.message
        ? (asObj!.message as string)
        : `Cloud rejected the write`;
    const hint =
      typeof asObj!.hint === "string" && asObj!.hint ? ` (${asObj!.hint as string})` : "";
    // Only genuinely transient Postgres conditions are worth retrying:
    // connection (08xxx), insufficient resources (53xxx), operator intervention
    // (57xxx), serialization failure / deadlock (40001 / 40P01). Everything else
    // — missing column (PGRST204/42703), FK/unique violation (23xxx), RLS
    // (42501/PGRST301), undefined table (42P01/PGRST205) — is deterministic and
    // will fail identically on every retry, so fail fast and show the real cause.
    const transient =
      /^08/.test(code) ||
      /^53/.test(code) ||
      /^57/.test(code) ||
      code === "40001" ||
      code === "40P01";
    return {
      retryable: transient,
      userMessage: `${baseMsg}${hint} [${code}]`,
      raw: err,
    };
  }

  // Native Error (no PostgREST shape) → network / transport failure
  if (err instanceof Error) {
    return {
      retryable: true,
      userMessage: "Couldn't reach Supabase — check internet",
      raw: err,
    };
  }

  // Try to extract status from the error object
  const status = typeof asObj?.status === "number" ? asObj.status : undefined;

  if (status === undefined) {
    // No HTTP status — network-level failure
    return {
      retryable: true,
      userMessage: "Couldn't reach Supabase — check internet",
      raw: err,
    };
  }

  if (status === 401 || status === 403) {
    return {
      retryable: false,
      userMessage:
        "Supabase authentication failed — check service key in Settings",
      raw: err,
    };
  }

  if (status === 429) {
    return {
      retryable: true,
      userMessage: "Supabase rate limited",
      raw: err,
    };
  }

  if (status >= 500) {
    return {
      retryable: true,
      userMessage: "Supabase server error",
      raw: err,
    };
  }

  // 4xx — surface Supabase's message when available
  const message =
    typeof asObj?.message === "string" ? asObj.message : undefined;
  if (message) {
    return { retryable: false, userMessage: message, raw: err };
  }

  return {
    retryable: false,
    userMessage: `Supabase request failed (HTTP ${status})`,
    raw: err,
  };
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Unwrap a Supabase query result and throw a ClassifiedSupabaseError if the
 * query returned an error.
 */
function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    throw classifyError(result.error);
  }
  return result.data as T;
}

// ─── createSupabaseClient ─────────────────────────────────────────────────────

export function createSupabaseClient(config: SupabaseConfig) {
  const { url, serviceKey } = config;
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });

  async function pushBatch(
    tableName: string,
    operation: "create" | "update" | "delete",
    rows: { rowId: string; payload: unknown }[]
  ): Promise<void> {
    if (rows.length === 0) return;

    if (operation === "delete") {
      const ids = rows.map((r) => r.rowId);
      const result = await sb.from(tableName).delete().in("id", ids);
      unwrap(result);
    } else {
      const payloads = rows.map((r) => r.payload as Record<string, unknown>);
      const result = await sb.from(tableName).upsert(payloads, { onConflict: "id" });
      unwrap(result);
    }
  }

  async function pushRow(input: {
    tableName: string;
    operation: "create" | "update" | "delete";
    rowId: string;
    payload: unknown;
  }): Promise<void> {
    const { tableName, operation, rowId, payload } = input;

    if (operation === "delete") {
      const result = await sb.from(tableName).delete().eq("id", rowId);
      unwrap(result);
    } else {
      // create | update → upsert
      const result = await sb
        .from(tableName)
        .upsert(payload as Record<string, unknown>, { onConflict: "id" });
      unwrap(result);
    }
  }

  // ── testConnection ─────────────────────────────────────────────────────────

  async function testConnection(): Promise<{ latencyMs: number }> {
    const start = Date.now();
    const result = await sb
      .from("patients")
      .select("id", { count: "exact", head: true })
      .limit(1);
    unwrap(result);
    return { latencyMs: Date.now() - start };
  }

  // ── fetchUnprocessedPaymentEvents ──────────────────────────────────────────

  async function fetchUnprocessedPaymentEvents(
    sinceIso: string,
    limit: number
  ): Promise<PaymentEventRow[]> {
    const result = await sb
      .from("payment_events")
      .select("*")
      .is("processed_at", null)
      .gt("received_at", sinceIso)
      .order("received_at", { ascending: true })
      .limit(limit);
    return unwrap(result) as PaymentEventRow[];
  }

  // ── markPaymentEventProcessed ──────────────────────────────────────────────

  async function markPaymentEventProcessed(eventId: string): Promise<void> {
    const now = new Date().toISOString();
    const result = await sb
      .from("payment_events")
      .update({ processed_at: now })
      .eq("event_id", eventId);
    unwrap(result);
  }

  // ── fetchFreeTierStatus ────────────────────────────────────────────────────

  async function fetchFreeTierStatus(): Promise<FreeTierStatusRow | null> {
    const result = await sb
      .from("free_tier_status")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(1);
    const rows = unwrap(result) as FreeTierStatusRow[];
    return rows[0] ?? null;
  }

  // ── fetchColumnInfo ────────────────────────────────────────────────────────
  
  async function fetchColumnInfo(
    tableNames: string[]
  ): Promise<Record<string, unknown>[]> {
    const result = await sb.rpc("information_schema_columns", {
      table_names: tableNames,
    });
    return unwrap(result) as Record<string, unknown>[];
  }

  // ── pullSince (Generic Adapter) ─────────────────────────────────────────────

  async function pullSince(
    tableName: string,
    cursorColumn: string,
    sinceIso: string,
    limit: number,
    filters?: Record<string, string>,
    lastId?: string
  ): Promise<Record<string, unknown>[]> {
    let query = sb
      .from(tableName)
      .select("*")
      .order(cursorColumn, { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);

    if (lastId && sinceIso && sinceIso !== new Date(0).toISOString()) {
      query = query.or(`${cursorColumn}.gt.${sinceIso},and(${cursorColumn}.eq.${sinceIso},id.gt.${lastId})`);
    } else {
      query = query.gt(cursorColumn, sinceIso);
    }

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
    }

    const result = await query;
    return unwrap(result) as Record<string, unknown>[];
  }

  // visit_tests are a separate table (not embedded on the visit row); pulled
  // per-visit so pull-visits can materialise the children locally.
  async function fetchVisitTestsForVisit(visitId: string): Promise<Record<string, unknown>[]> {
    const result = await sb
      .from("visit_tests")
      .select("*")
      .eq("visit_id", visitId);
    return unwrap(result) as Record<string, unknown>[];
  }

  // Phase 3e Plan A: Fix N+1 — fetch all visit_tests for a batch of visits
  async function fetchVisitTestsForVisits(visitIds: string[]): Promise<Record<string, unknown>[]> {
    const result = await sb
      .from("visit_tests")
      .select("*")
      .in("visit_id", visitIds);
    return unwrap(result) as Record<string, unknown>[];
  }

  // Invoices for a batch of visits, so a staff-portal visit arrives on the lab PC
  // with the bill it was created with. Batched for the same reason as above.
  async function fetchInvoicesForVisits(visitIds: string[]): Promise<Record<string, unknown>[]> {
    const result = await sb
      .from("invoices")
      .select("*")
      .in("visit_id", visitIds);
    return unwrap(result) as Record<string, unknown>[];
  }

  // ── pushHeartbeat ──────────────────────────────────────────────────────────
  // Phase 3d Plan A: portal staleness banner queries cloud_heartbeat.last_pushed_at
  // to know whether the desktop is online. Best-effort — never throws.

  async function pushHeartbeat(): Promise<void> {
    try {
      const { error } = await sb
        .from("cloud_heartbeat")
        .upsert(
          { id: "singleton", last_pushed_at: new Date().toISOString() },
          { onConflict: "id" }
        );
      if (error) logger.warn("cloud", "[heartbeat] push failed:", (error as { message?: string }).message);
    } catch (e) {
      logger.warn("cloud", "[heartbeat] threw:", e);
    }
  }

  return {
    pushRow,
    pushBatch,
    testConnection,
    fetchUnprocessedPaymentEvents,
    markPaymentEventProcessed,
    fetchFreeTierStatus,
    fetchColumnInfo,
    pushHeartbeat,
    pullSince,
    fetchVisitTestsForVisit,
    fetchVisitTestsForVisits,
    fetchInvoicesForVisits,
  };
}

// ─── Type alias ───────────────────────────────────────────────────────────────

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;
