import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResultUpsertBody {
  id?: string;
  visit_test_id: string;
  parameter_id: string;
  value: string;
  is_abnormal: boolean;
  /**
   * @deprecated Ignored — the server assigns the stored version. Retained so
   * requests queued offline by an older client still parse.
   */
  version?: number;
  /**
   * The version the client based this edit on; omit for a new value. When
   * supplied, the write is rejected if the row has moved on since.
   */
  base_version?: number;
}

/**
 * Thrown when the row changed after the client read it.
 *
 * The stored version decides who wins a desktop-vs-cloud conflict in
 * `pull-results` (`existing.version > r.version`), so it must be assigned by the
 * server. Previously the client sent `read + 1` and the server stored it
 * verbatim: a client could claim version 9999 and win every future conflict
 * against the master copy, and two staff editing the same value both sent the
 * same number, so one silently overwrote the other.
 */
export class VersionConflictError extends Error {
  readonly code = "version_conflict" as const;
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super("Someone else changed this value while you were editing it. Reload to see the current value.");
    this.name = "VersionConflictError";
  }
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

/**
 * Records that this test now has a result on it.
 *
 * The desktop's own entry path sets these (results.ipc), and the owner's
 * dashboard counts its "tests entered but not locked" backlog from
 * `result_entered_at`. The portal never set it, so every result typed on a phone
 * was invisible in that count: it read zero while the work piled up, which is
 * the one number telling the owner there is verifying to do.
 *
 * Safe to set unconditionally here — `assertNotLocked` has already refused the
 * write if this test was signed off, so the status cannot be moved backwards
 * from a verified state.
 */
async function markResultEntered(sb: SupabaseClient, visitTestId: string): Promise<void> {
  const { error } = await sb
    .from("visit_tests")
    .update({ status: "ResultEntered", result_entered_at: new Date().toISOString() })
    .eq("id", visitTestId);
  if (error) throw new Error(error.message);
}

/** Idempotently writes a result row. Updates by id when known; otherwise inserts
 *  a new row, falling back to an update keyed on (visit_test_id, parameter_id)
 *  if a concurrent debounced save already created it (unique-violation 23505).
 *  Returns the row id and the version the server assigned. */
export async function upsertResult(
  sb: SupabaseClient,
  userId: string,
  body: ResultUpsertBody,
): Promise<{ id: string; version: number }> {
  await assertNotLocked(sb, body.visit_test_id);

  const current = await readCurrent(sb, body);
  const currentVersion = current?.version ?? 0;

  // Optimistic concurrency. `base_version` is the version the client based its
  // edit on; if the row has moved on since, someone else changed the value and
  // this write would silently discard theirs.
  if (body.base_version !== undefined && body.base_version !== currentVersion) {
    throw new VersionConflictError(body.base_version, currentVersion);
  }

  const now = new Date().toISOString();
  const writable = {
    value: body.value,
    is_abnormal: body.is_abnormal,
    // Server-assigned, never taken from the request — see VersionConflictError.
    version: currentVersion + 1,
    entered_by_user_id: userId,
    entered_at: now,
    updated_at: now,
  };

  if (current) {
    const { error } = await sb.from("results").update(writable).eq("id", current.id);
    if (error) throw new Error(error.message);
    await markResultEntered(sb, body.visit_test_id);
    return { id: current.id, version: writable.version };
  }

  const id = crypto.randomUUID();
  const { data, error } = await sb
    .from("results")
    .insert({ id, visit_test_id: body.visit_test_id, parameter_id: body.parameter_id, ...writable })
    .select("id")
    .single();

  if (!error && data) {
    await markResultEntered(sb, body.visit_test_id);
    return { id: data.id as string, version: writable.version };
  }

  // Unique violation → a concurrent debounced save created the row between our
  // read and this insert. Re-read to get its version and update instead.
  if (error && error.code === "23505") {
    const raced = await readByParameter(sb, body);
    if (raced) {
      const racedVersion = raced.version + 1;
      const { error: updErr } = await sb
        .from("results")
        .update({ ...writable, version: racedVersion })
        .eq("id", raced.id);
      if (updErr) throw new Error(updErr.message);
      await markResultEntered(sb, body.visit_test_id);
      return { id: raced.id, version: racedVersion };
    }
  }

  throw new Error(error?.message ?? "result upsert failed");
}

interface CurrentResult {
  id: string;
  version: number;
}

/** Reads the row this write targets: by id when known, else by its natural key. */
async function readCurrent(
  sb: SupabaseClient,
  body: ResultUpsertBody,
): Promise<CurrentResult | null> {
  if (body.id) {
    const { data, error } = await sb
      .from("results")
      .select("id, version")
      .eq("id", body.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id as string, version: Number(data.version ?? 0) } : null;
  }
  return readByParameter(sb, body);
}

async function readByParameter(
  sb: SupabaseClient,
  body: ResultUpsertBody,
): Promise<CurrentResult | null> {
  const { data, error } = await sb
    .from("results")
    .select("id, version")
    .eq("visit_test_id", body.visit_test_id)
    .eq("parameter_id", body.parameter_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id as string, version: Number(data.version ?? 0) } : null;
}
