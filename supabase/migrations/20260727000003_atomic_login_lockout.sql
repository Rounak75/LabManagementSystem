-- Make failed-login counting atomic.
--
-- Both login paths counted failures with a read-modify-write: read
-- `failed_attempts`, add one, write it back (portal lib/auth.ts `bumpFailed`, and
-- the auth-login Edge Function). Requests issued concurrently all read the same
-- value and all write the same value, so the 5-attempt lockout never engaged
-- against an attacker sending guesses in parallel — the counter hovered at 1 no
-- matter how many attempts were made. The lockout only worked against a serial
-- attacker, which is not the one it exists to stop.
--
-- Postgres does the increment in one statement instead, so concurrent attempts
-- serialise on the row and each one counts exactly once.

-- ── patients ────────────────────────────────────────────────────────────────
create or replace function record_failed_patient_login(
  p_patient_id      text,
  p_max_failed      int,
  p_lockout_minutes int
)
returns table (failed_attempts int, locked_until timestamptz)
language sql
security definer
as $$
  insert into patient_accounts as pa (
    id, patient_id, failed_attempts, version, created_at, updated_at
  )
  values (gen_random_uuid()::text, p_patient_id, 1, 0, now(), now())
  on conflict (patient_id) do update
    set failed_attempts = pa.failed_attempts + 1,
        locked_until = case
          when pa.failed_attempts + 1 >= p_max_failed
            then now() + make_interval(mins => p_lockout_minutes)
          else pa.locked_until
        end,
        version = pa.version + 1,
        updated_at = now()
  returning pa.failed_attempts, pa.locked_until;
$$;

-- Clears the counters on a successful login, in one statement.
create or replace function record_successful_patient_login(p_patient_id text)
returns void
language sql
security definer
as $$
  insert into patient_accounts as pa (
    id, patient_id, failed_attempts, version, last_login_at, created_at, updated_at
  )
  values (gen_random_uuid()::text, p_patient_id, 0, 0, now(), now(), now())
  on conflict (patient_id) do update
    set failed_attempts = 0,
        locked_until = null,
        last_login_at = now(),
        version = pa.version + 1,
        updated_at = now();
$$;

-- ── staff ───────────────────────────────────────────────────────────────────
create or replace function record_failed_staff_login(
  p_user_id         text,
  p_max_failed      int,
  p_lockout_minutes int
)
returns table (failed_attempts int, locked_until timestamptz)
language sql
security definer
as $$
  update users u
     set failed_attempts = u.failed_attempts + 1,
         locked_until = case
           when u.failed_attempts + 1 >= p_max_failed
             then now() + make_interval(mins => p_lockout_minutes)
           else u.locked_until
         end
   where u.id = p_user_id
  returning u.failed_attempts, u.locked_until;
$$;

create or replace function record_successful_staff_login(p_user_id text)
returns void
language sql
security definer
as $$
  update users
     set failed_attempts = 0,
         locked_until = null
   where id = p_user_id;
$$;

-- Only the trusted server paths may call these: the portal's API routes use the
-- service role, and the auth-login Edge Function does too. Nothing reachable
-- with the public anon key can move a lockout counter.
revoke execute on function record_failed_patient_login(text, int, int) from public, anon, authenticated;
revoke execute on function record_successful_patient_login(text) from public, anon, authenticated;
revoke execute on function record_failed_staff_login(text, int, int) from public, anon, authenticated;
revoke execute on function record_successful_staff_login(text) from public, anon, authenticated;

grant execute on function record_failed_patient_login(text, int, int) to service_role;
grant execute on function record_successful_patient_login(text) to service_role;
grant execute on function record_failed_staff_login(text, int, int) to service_role;
grant execute on function record_successful_staff_login(text) to service_role;
