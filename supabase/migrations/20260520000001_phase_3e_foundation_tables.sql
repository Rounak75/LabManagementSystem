-- Phase 3e Plan A: foundation tables for the admin portal.

-- 0. Ensure `users` exists (Phase 3c skipped it — User data wasn't synced).
-- Plan A starts syncing User rows; this table is the receiving end.
create table if not exists users (
  id text primary key
);

-- 1. New columns on existing tables
alter table users
  add column if not exists can_enter_results boolean not null default true;

alter table patients
  add column if not exists source text default 'desktop' check (source in ('desktop', 'admin'));

alter table visits
  add column if not exists source text default 'desktop' check (source in ('desktop', 'admin')),
  add column if not exists verified_by_user_id text,
  add column if not exists verified_at timestamptz;

alter table results
  add column if not exists entered_by_user_id text,
  add column if not exists verified_at timestamptz;

alter table payments
  add column if not exists received_by_user_id text,
  add column if not exists source text default 'desktop' check (source in ('desktop', 'admin'));

-- 2. IdReservation
create table if not exists id_reservations (
  id           uuid primary key default gen_random_uuid(),
  prefix       text not null,
  number       integer not null,
  reserved_by  text,
  reserved_at  timestamptz not null default now(),
  consumed_at  timestamptz,
  consumed_by  text,
  source       text not null default 'desktop' check (source in ('desktop', 'admin')),
  unique (prefix, number)
);
create index if not exists id_reservations_prefix_consumed_idx
  on id_reservations(prefix, consumed_at);

-- 3. PrintJob
create table if not exists print_jobs (
  id              uuid primary key default gen_random_uuid(),
  visit_id        text not null,
  requested_by_id text not null,
  requested_at    timestamptz not null default now(),
  picked_up_at    timestamptz,
  completed_at    timestamptz,
  status          text not null default 'Queued' check (status in ('Queued', 'Picked', 'Done', 'Failed')),
  error_message   text
);
create index if not exists print_jobs_status_requested_idx
  on print_jobs(status, requested_at);

-- 4. ClientError
create table if not exists client_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,
  user_agent  text not null,
  url         text not null,
  message     text not null,
  stack       text,
  logged_at   timestamptz not null default now()
);
create index if not exists client_errors_logged_idx on client_errors(logged_at);

-- 5. Users table (mirror) — adds missing columns if Phase 3c didn't fully push
alter table users
  add column if not exists name text,
  add column if not exists username text unique,
  add column if not exists password_hash text,
  add column if not exists role text,
  add column if not exists is_active boolean default true,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists can_collect_samples boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  -- Admin-portal login lockout (DB-backed; Edge Function isolates don't share
  -- in-memory state, so failed-attempt tracking must live here).
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;
