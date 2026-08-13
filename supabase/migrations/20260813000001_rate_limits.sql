-- A general per-origin rate limiter, for the routes that were not login.
--
-- 20260727000005 solved this shape of problem once, for the portal login, and
-- solved it well: count by origin rather than by account, keep an HMAC of the
-- address rather than the address, purge on a cron. What it did not do is
-- generalise, so every other route in the portal stayed uncounted — including
-- the three that write rows a patient did not have to be anyone in particular to
-- create (`/api/bookings`, `/api/payment-claims`, `/api/disputes`).
--
-- Those matter more than they look on a free tier. A booking is a row in the
-- database *and* a line in the staff's morning queue; ten thousand of them is
-- both a quota problem and an operational one, and neither is undone by deleting
-- the rows afterwards. The lab reads that queue on a phone.
--
-- Same table shape as `login_attempts`, plus a `bucket` so one table serves every
-- route without them sharing a budget. Kept as a separate table rather than
-- folded into `login_attempts`, because that table's rows have a meaning of their
-- own — a *failed* login — and the cron that purges it and the captcha rule that
-- reads it both depend on that meaning.

create table if not exists rate_limit_hits (
  -- Which limit this hit counts against: 'bookings', 'disputes', and so on. One
  -- table, one index, separate budgets.
  bucket text        not null,
  -- HMAC of the client address under the project's JWT secret, exactly as
  -- `login_attempts.ip_key`. The raw address is never stored: this table would
  -- otherwise be a log of who used the portal from where, and a bare hash of an
  -- IPv4 address is four billion guesses away from being reversed.
  ip_key text        not null,
  hit_at timestamptz not null default now()
);

-- Ordered by time descending because every read is "how many in the last N",
-- which walks from now backwards and stops.
create index if not exists rate_limit_hits_bucket_ip_time_idx
  on rate_limit_hits (bucket, ip_key, hit_at desc);

alter table rate_limit_hits enable row level security;

-- No policies, deliberately: only service_role (which bypasses RLS) may touch
-- this. Nothing holding the public anon key can read the table, forge hits into
-- it, or delete its own.

-- Records one hit and says whether it is allowed.
--
-- Counting happens after the insert, so the request being judged is included in
-- its own count and `p_max` reads as "this many per window" rather than "this
-- many plus one". Both in one statement, because the read-modify-write version
-- of this is the bug 20260727000003 and 20260727000005 were both written to fix:
-- parallel requests each read the same count, each decide they are fine, and the
-- limit never engages against the only traffic it was built to stop.
--
-- Refused hits are recorded too. A client that keeps hammering after being told
-- no keeps its own count above the line, so the window slides forward from the
-- last attempt rather than the last *allowed* attempt.
create or replace function hit_rate_limit(
  p_bucket         text,
  p_ip_key         text,
  p_window_seconds int,
  p_max            int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  recent  int;
  oldest  timestamptz;
  retry   int;
begin
  insert into rate_limit_hits (bucket, ip_key) values (p_bucket, p_ip_key);

  select count(*), min(hit_at)
    into recent, oldest
    from rate_limit_hits
   where bucket = p_bucket
     and ip_key = p_ip_key
     and hit_at > now() - make_interval(secs => p_window_seconds);

  -- When the oldest hit in the window falls out, there is room again. Told to
  -- the caller so it can send a Retry-After the client can actually obey,
  -- rather than leaving it to guess and re-poll.
  retry := greatest(
    1,
    ceil(extract(epoch from (oldest + make_interval(secs => p_window_seconds)) - now()))::int
  );

  return jsonb_build_object(
    'allowed', recent <= p_max,
    'count', recent,
    'retry_after_seconds', retry
  );
end;
$$;

revoke execute on function hit_rate_limit(text, text, int, int) from public, anon, authenticated;
grant  execute on function hit_rate_limit(text, text, int, int) to service_role;

-- Rows outside every window are dead weight, and this table takes a hit per
-- request rather than per failure, so it grows faster than `login_attempts`.
-- Purged hourly on the same cron the project already runs
-- (20260518000006_pg_cron_jobs.sql).
--
-- Unscheduled first so a re-run cannot fail or leave a duplicate job — the guard
-- used in 20260727000005 and 20260727000009. A migration that cannot be applied
-- twice blocks every migration behind it the moment a queue is half-applied.
select cron.unschedule('purge-rate-limit-hits')
 where exists (select 1 from cron.job where jobname = 'purge-rate-limit-hits');

select cron.schedule(
  'purge-rate-limit-hits',
  '23 * * * *',
  $$delete from rate_limit_hits where hit_at < now() - interval '6 hours'$$
);
