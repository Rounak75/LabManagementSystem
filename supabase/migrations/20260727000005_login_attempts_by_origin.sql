-- Count failed portal logins by origin, not just by account.
--
-- `record_failed_patient_login` locks one patient after 5 bad guesses. It does
-- nothing about one guess against each of ten thousand phone numbers: no single
-- account's counter ever reaches 5, so nothing engages, and the attacker also
-- learns which numbers belong to registered patients. The portal logs in on a
-- 10-digit phone number, so that space is small enough to walk.
--
-- Counting by origin closes it. The response is the captcha the /book form
-- already uses rather than a hard block, because a clinic or hostel behind one
-- NAT address is many legitimate patients, and blocking the address would block
-- all of them.

create table if not exists login_attempts (
  -- HMAC of the client address under the project's JWT secret. The raw address
  -- is never stored: this table would otherwise be a record of who tried to sign
  -- in from where, and a bare hash of an IPv4 address is trivially reversible.
  ip_key      text        not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_key_time_idx
  on login_attempts (ip_key, attempted_at desc);

alter table login_attempts enable row level security;

-- No policies: only service_role (which bypasses RLS) may touch this. Nothing
-- reachable with the public anon key can read or forge attempt history.

-- Records one failure and returns how many that origin has had inside the
-- window, in a single statement so parallel attempts each count exactly once.
create or replace function record_failed_login_origin(
  p_ip_key         text,
  p_window_minutes int
)
returns int
language plpgsql
security definer
as $$
declare
  recent int;
begin
  insert into login_attempts (ip_key) values (p_ip_key);

  select count(*) into recent
    from login_attempts
   where ip_key = p_ip_key
     and attempted_at > now() - make_interval(mins => p_window_minutes);

  return recent;
end;
$$;

-- How many failures an origin has inside the window, without recording one.
-- Called before credentials are checked, to decide whether to demand a puzzle.
create or replace function count_failed_logins_origin(
  p_ip_key         text,
  p_window_minutes int
)
returns int
language sql
security definer
as $$
  select count(*)::int
    from login_attempts
   where ip_key = p_ip_key
     and attempted_at > now() - make_interval(mins => p_window_minutes);
$$;

-- A successful login clears that origin's history, so a patient who mistypes
-- twice and then gets in is not still challenged on their next visit.
create or replace function clear_failed_logins_origin(p_ip_key text)
returns void
language sql
security definer
as $$
  delete from login_attempts where ip_key = p_ip_key;
$$;

revoke execute on function record_failed_login_origin(text, int) from public, anon, authenticated;
revoke execute on function count_failed_logins_origin(text, int) from public, anon, authenticated;
revoke execute on function clear_failed_logins_origin(text) from public, anon, authenticated;

grant execute on function record_failed_login_origin(text, int) to service_role;
grant execute on function count_failed_logins_origin(text, int) to service_role;
grant execute on function clear_failed_logins_origin(text) to service_role;

-- Rows outside every window are dead weight; without this the table only grows.
-- pg_cron is already used by this project (see 20260518000006_pg_cron_jobs.sql).
select cron.schedule(
  'purge-login-attempts',
  '17 * * * *',
  $$delete from login_attempts where attempted_at < now() - interval '1 day'$$
);
