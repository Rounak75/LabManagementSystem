import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultUpsertBody {
  id?: string;
  visit_test_id: string;
  parameter_id: string;
  value: string;
  is_abnormal: boolean;
  version: number;
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
