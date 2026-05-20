-- Phase 3e Plan C: align the cloud schema to the desktop Prisma field names.
-- The Phase 3c init migration used hand-picked names (full_name, missing
-- columns) that diverge from what the desktop outbox pushes (plain camel→snake
-- of Prisma fields), what the patient portal queries (name, deleted_at), and
-- what the admin portal + pull-* modules expect. With 0 rows in these tables
-- today, realigning is low-risk and fixes the latent sync/portal gaps.

-- ── patients ───────────────────────────────────────────────────────────────
-- Rename full_name → name (desktop pushes `name`; portal reads `name`).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='patients' and column_name='full_name')
     and not exists (select 1 from information_schema.columns
             where table_name='patients' and column_name='name') then
    alter table patients rename column full_name to name;
  end if;
end $$;

alter table patients
  add column if not exists patient_id text,
  add column if not exists created_by_id text,
  add column if not exists portal_account_id text,
  add column if not exists deleted_at timestamptz;

create unique index if not exists patients_patient_id_key on patients(patient_id);

-- ── visits ─────────────────────────────────────────────────────────────────
alter table visits
  add column if not exists type text,
  add column if not exists staff_id text,
  add column if not exists deleted_at timestamptz;

-- ── audit_logs ─────────────────────────────────────────────────────────────
-- Mirror of the desktop AuditLog model. Admin-portal actions write here so
-- there's a single audit trail; a cloud→desktop pull is added in a later plan.
create table if not exists audit_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  action        text not null,
  target_entity text not null,
  target_id     text not null,
  details       text,
  timestamp     timestamptz not null default now()
);
create index if not exists audit_logs_timestamp_idx on audit_logs(timestamp);
alter table audit_logs enable row level security;
drop policy if exists audit_logs_admin_rw on audit_logs;
create policy audit_logs_admin_rw on audit_logs
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));

-- ── visit_tests admin write ────────────────────────────────────────────────
-- Plan A added admin-write policies for patients/visits/results/payments but
-- not visit_tests; the admin visit-create flow inserts these children.
alter table visit_tests enable row level security;
drop policy if exists visit_tests_admin_write on visit_tests;
create policy visit_tests_admin_write on visit_tests
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));
