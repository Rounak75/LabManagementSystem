-- Stop a patient writing their own account's security and sync columns.
--
-- `mintPatientJwt` signs portal sessions with `role: "anon"`
-- (apps/portal/src/lib/jwt.ts), so a patient's session token presented directly
-- to PostgREST alongside the public anon key runs as the `anon` role and
-- receives every `to anon` policy. One of them, `patient_accounts_update_own`,
-- is an unrestricted UPDATE on the patient's own row:
--
--   PATCH /rest/v1/patient_accounts?patient_id=eq.<own id>
--   { "locked_until": null, "failed_attempts": 0, "version": 9999 }
--
-- RLS filters rows, not columns, so scoping the policy to the caller's own row
-- does not stop them writing columns the application never exposes:
--
--   * `password_hash` — settable directly, bypassing the eight-character
--     minimum enforced in trySetPassword().
--   * `failed_attempts` / `locked_until` — the brute-force lockout that
--     20260727000003_atomic_login_lockout.sql went to the trouble of making
--     atomic, resettable by its target.
--   * `version` — the optimistic-concurrency counter the desktop sync compares
--     against. A forged value makes the desktop skip or clobber a legitimate
--     update, which is the one that corrupts data rather than merely annoying.
--
-- The fix is to drop the policy outright rather than narrow it. Nothing calls
-- it: `getAnonClient` in apps/portal/src/lib/supabase-server.ts has no callers
-- anywhere in the repository, and every portal write — including the password
-- change in trySetPassword — goes through getServiceClient(), which bypasses
-- RLS. The grant protects no feature and undermines two controls.
--
-- The SELECT policy is deliberately left in place: it is read-only, correctly
-- scoped by the JWT's patient_id claim, and is the intended design if the anon
-- client is ever wired up for patient-facing reads.

drop policy if exists patient_accounts_update_own on public.patient_accounts;

-- As with bookings: a dropped policy stops RLS granting access, but the
-- table-level privilege is separate. Leave anon able to read (the SELECT policy
-- still gates which rows) and nothing else.
revoke insert, update, delete on public.patient_accounts from anon;
