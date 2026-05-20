-- Phase 3e Plan D: align cloud `parameters` + `results` to the desktop Prisma
-- field names so result entry from the admin portal both succeeds and round-trips
-- to the desktop pull layer. Canonical rule: cloud column = snake_case(Prisma field).
-- The Phase 3c init_synced_tables migration omitted several TestParameter /
-- TestResult fields the result-entry flow depends on.

-- ── parameters (Prisma TestParameter) ────────────────────────────────────────
-- result_type drives the Numeric vs Qualitative input switch; display_order sorts
-- the parameter cards to match the desktop layout; is_active for parity.
alter table parameters
  add column if not exists result_type   text    not null default 'Numeric',
  add column if not exists display_order integer not null default 0,
  add column if not exists is_active     boolean not null default true;

-- ── results (Prisma TestResult) ──────────────────────────────────────────────
-- version + entered_at exist on the desktop model but were missing in cloud;
-- the upsert route writes both. (entered_by_user_id was added in Plan A.)
alter table results
  add column if not exists version    integer not null default 1,
  add column if not exists entered_at timestamptz;

-- One result row per (visit_test, parameter) — mirrors Prisma @@unique and makes
-- the debounced upsert idempotent under racing saves.
create unique index if not exists results_visit_test_parameter_key
  on results(visit_test_id, parameter_id);

-- results admin-write RLS already exists from Plan A (20260520000002).
