import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultUpsertBody {
  id?: string;
  visit_test_id: string;
  parameter_id: string;
  value: string;
  is_abnormal: boolean;
  version: number;
}

/** Thrown when a write targets a verified-and-locked visit test. */
export class ResultLockedError extends Error {
  readonly code = "result_locked" as const;
  constructor() {
    super("This test has been verified and locked. Ask an Admin to unlock it before editing.");
    this.name = "ResultLockedError";
  }
}

/**
 * Refuses the write if the visit test is locked.
 *
 * A locked visit test has been verified and signed off by an Admin, and its
 * report may already have been printed and given to the patient. The desktop
 * enforces this on its own write path (results.ipc: `if (vt.isLocked) throw
 * FORBIDDEN`) — without the same check here, any Staff account can rewrite a
 * signed-off result through the portal and cloud sync carries the change to the
 * master copy on the lab PC. Postgres RLS enforces this too; this check exists
 * so the UI gets a clear, actionable error instead of a generic RLS denial.
 */
async function assertNotLocked(sb: SupabaseClient, visitTestId: string): Promise<void> {
  const { data, error } = await sb
    .from("visit_tests")
    .select("is_locked")
    .eq("id", visitTestId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`visit test not found: ${visitTestId}`);
  // `is_locked` is nullable on clouds that predate the column; null means unlocked.
  if (data.is_locked === true) throw new ResultLockedError();
}

/** Idempotently writes a result row. Updates by id when known; otherwise inserts
 *  a new row, falling back to an update keyed on (visit_test_id, parameter_id)
 *  if a concurrent debounced save already created it (unique-violation 23505).
 *  Returns the row id. */
export async function upsertResult(
  sb: SupabaseClient,
  userId: string,
  body: ResultUpsertBody,
): Promise<string> {
  await assertNotLocked(sb, body.visit_test_id);

  const now = new Date().toISOString();
  const writable = {
    value: body.value,
    is_abnormal: body.is_abnormal,
    version: body.version,
    entered_by_user_id: userId,
    entered_at: now,
    updated_at: now,
  };

  if (body.id) {
    const { error } = await sb.from("results").update(writable).eq("id", body.id);
    if (error) throw new Error(error.message);
    return body.id;
  }

  const id = crypto.randomUUID();
  const { data, error } = await sb
    .from("results")
    .insert({ id, visit_test_id: body.visit_test_id, parameter_id: body.parameter_id, ...writable })
    .select("id")
    .single();

  if (!error && data) return data.id as string;

  // Unique violation → the row already exists for this (visit_test, parameter).
  if (error && error.code === "23505") {
    const { data: existing, error: selErr } = await sb
      .from("results")
      .select("id")
      .eq("visit_test_id", body.visit_test_id)
      .eq("parameter_id", body.parameter_id)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (existing) {
      const { error: updErr } = await sb.from("results").update(writable).eq("id", existing.id);
      if (updErr) throw new Error(updErr.message);
      return existing.id as string;
    }
  }

  throw new Error(error?.message ?? "result upsert failed");
}
