-- Phase 3e follow-up: close every remaining desktop→cloud column gap so the
-- backfilled tables stop failing with "column not found" and drain out of the
-- outbox. The desktop pushes snake_case(Prisma field) for each column; several
-- fields on the never-before-synced catalogue/doctor tables (and a few children)
-- were never mirrored into the cloud schema by the earlier alignment migrations.
--
-- All idempotent (add column if not exists): safe to run even where a column
-- already exists. The results table's two divergent fields
-- (abnormal_override / entered_by_id) are handled on the desktop push side
-- instead, since the cloud's is_abnormal_override / entered_by_user_id columns
-- are already what the admin portal reads and writes.

-- ── doctors (Prisma Doctor) ──────────────────────────────────────────────────
alter table doctors
  add column if not exists clinic     text,
  add column if not exists is_active  boolean default true,
  add column if not exists deleted_at timestamptz;

-- ── tests (Prisma Test) ──────────────────────────────────────────────────────
alter table tests
  add column if not exists deleted_at timestamptz;

-- ── parameters (Prisma TestParameter) ────────────────────────────────────────
alter table parameters
  add column if not exists compute_rule text;

-- ── visit_tests (Prisma VisitTest) ───────────────────────────────────────────
alter table visit_tests
  add column if not exists outsourced_status   text,
  add column if not exists sample_collected_at timestamptz,
  add column if not exists result_entered_at   timestamptz,
  add column if not exists verified_by_id      text,
  add column if not exists verified_at         timestamptz,
  add column if not exists is_locked           boolean default false;

-- ── home_visits (Prisma HomeVisit) ───────────────────────────────────────────
alter table home_visits
  add column if not exists unable_reason text,
  add column if not exists notes         text,
  add column if not exists deleted_at    timestamptz;
