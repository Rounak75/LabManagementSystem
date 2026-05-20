-- Phase 3d Plan H — lab info, blackouts (whole-day closures), per-test collection
-- restrictions. Mirrors the Prisma LabClosure model and adds two columns to the
-- tests table that the desktop already writes via the cloud outbox.

-- ─── lab_closures (whole-day closures synced from desktop) ───────────────────
create table if not exists public.lab_closures (
  id          text primary key,
  date        timestamptz not null unique,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists lab_closures_date_idx on public.lab_closures (date);

alter table public.lab_closures enable row level security;

drop policy if exists lab_closures_public_read on public.lab_closures;
create policy lab_closures_public_read
  on public.lab_closures
  for select
  to anon
  using (date >= now() - interval '1 day');

drop policy if exists lab_closures_service_write on public.lab_closures;
create policy lab_closures_service_write
  on public.lab_closures
  for all
  to service_role
  using (true)
  with check (true);

-- ─── tests.collection_time_restriction (used by /book to filter slots) ───────
-- Also defensively ensures tests.is_active exists since the portal /book page
-- already filters on it (`is_active = true`).
alter table public.tests
  add column if not exists collection_time_restriction text;

alter table public.tests
  add column if not exists is_active boolean not null default true;

-- ─── lab_settings columns the portal needs for /info and /book ──────────────
-- weekly_holidays is stored as a JSON-string on the desktop; mirror as text.
alter table public.lab_settings
  add column if not exists weekly_holidays text not null default '[]';

alter table public.lab_settings
  add column if not exists is_open_today boolean not null default true;

alter table public.lab_settings
  add column if not exists manual_closure_reason text;
