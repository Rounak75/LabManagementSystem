-- Retention for the five cloud tables that grew without a ceiling.
--
-- 20260518000006_pg_cron_jobs.sql prunes webhook_log and free_tier_status, and
-- 20260727000005 prunes login_attempts. Nothing pruned audit_logs,
-- client_errors, print_jobs, id_reservations or payment_events.
--
-- On a paid plan that is untidy. On the free plan the database is capped at
-- 500 MB, and the failure mode when it fills is the bad one: Postgres stops
-- accepting writes, mid-shift, and the lab cannot register a patient or save a
-- result. Clinical rows are not the threat — a busy day is a few hundred
-- kilobytes and would take years to matter. The threat is the tables that grow
-- per *action* rather than per patient, and audit_logs is the fastest of them.
--
-- Retention windows are chosen so the lab keeps what it might need and drops
-- what it never reads again:
--
--   audit_logs       1 year   — long enough to answer "who changed this result
--                               and when" for any report still in circulation.
--   client_errors    30 days  — a crash nobody looked at in a month is not
--                               going to be investigated.
--   print_jobs       90 days  — a completed print request is a transient
--                               instruction, not a record; the visit is the
--                               record.
--   id_reservations  90 days  — only consumed ones. An unconsumed reservation
--                               is a live claim on an ID and deleting it would
--                               let the number be handed out twice.
--   payment_events   1 year   — the raw Razorpay envelope behind a payment.
--                               Kept as long as the audit trail that cites it.
--
-- `audit_logs.timestamp` is quoted throughout: the column name collides with the
-- SQL keyword and an unquoted reference parses as a type name, not a column.

-- Existing schedules are replaced rather than duplicated, so re-running this
-- migration against a database that already has them is a no-op.
select cron.unschedule('prune-audit-logs')      where exists (select 1 from cron.job where jobname = 'prune-audit-logs');
select cron.unschedule('prune-client-errors')   where exists (select 1 from cron.job where jobname = 'prune-client-errors');
select cron.unschedule('prune-print-jobs')      where exists (select 1 from cron.job where jobname = 'prune-print-jobs');
select cron.unschedule('prune-id-reservations') where exists (select 1 from cron.job where jobname = 'prune-id-reservations');
select cron.unschedule('prune-payment-events')  where exists (select 1 from cron.job where jobname = 'prune-payment-events');

select cron.schedule(
  'prune-audit-logs',
  '20 2 * * *',
  $$delete from public.audit_logs where "timestamp" < now() - interval '1 year'$$
);

select cron.schedule(
  'prune-client-errors',
  '25 2 * * *',
  $$delete from public.client_errors where logged_at < now() - interval '30 days'$$
);

select cron.schedule(
  'prune-print-jobs',
  '30 2 * * *',
  $$delete from public.print_jobs where completed_at is not null and completed_at < now() - interval '90 days'$$
);

-- Only consumed reservations. An unconsumed row is an outstanding claim on a
-- visit ID; deleting it would let reserve-visit-id hand the same number out
-- twice and collide on insert.
select cron.schedule(
  'prune-id-reservations',
  '35 2 * * *',
  $$delete from public.id_reservations where consumed_at is not null and consumed_at < now() - interval '90 days'$$
);

select cron.schedule(
  'prune-payment-events',
  '40 2 * * *',
  $$delete from public.payment_events where received_at < now() - interval '1 year'$$
);

-- The prunes above scan by timestamp; without these they are sequential scans
-- that grow with the table they are meant to keep small.
create index if not exists audit_logs_timestamp_idx    on public.audit_logs ("timestamp");
create index if not exists client_errors_logged_at_idx on public.client_errors (logged_at);
create index if not exists print_jobs_completed_at_idx on public.print_jobs (completed_at);
create index if not exists id_reservations_consumed_at_idx on public.id_reservations (consumed_at);
