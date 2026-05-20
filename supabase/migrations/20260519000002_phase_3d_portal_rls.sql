-- Phase 3d Plan A — Row-Level Security for portal tables.
-- service_role bypasses RLS (used by desktop sync + Edge Functions).
-- anon role gets carefully scoped read/write per the spec.

-- ─── patient_accounts ────────────────────────────────────────────────────
alter table patient_accounts enable row level security;

drop policy if exists patient_accounts_select_own on patient_accounts;
create policy patient_accounts_select_own
  on patient_accounts for select
  to anon
  using (patient_id = auth.jwt() ->> 'patient_id');

drop policy if exists patient_accounts_update_own on patient_accounts;
create policy patient_accounts_update_own
  on patient_accounts for update
  to anon
  using (patient_id = auth.jwt() ->> 'patient_id')
  with check (patient_id = auth.jwt() ->> 'patient_id');

-- ─── bookings ────────────────────────────────────────────────────────────
alter table bookings enable row level security;

drop policy if exists bookings_insert_anon on bookings;
create policy bookings_insert_anon
  on bookings for insert
  to anon
  with check (true);

drop policy if exists bookings_select_recent on bookings;
create policy bookings_select_recent
  on bookings for select
  to anon
  using (created_at > now() - interval '7 days');

-- ─── disputes ────────────────────────────────────────────────────────────
alter table disputes enable row level security;

drop policy if exists disputes_insert_own on disputes;
create policy disputes_insert_own
  on disputes for insert
  to anon
  with check (patient_id = auth.jwt() ->> 'patient_id');

-- ─── payment_claims ──────────────────────────────────────────────────────
alter table payment_claims enable row level security;

drop policy if exists payment_claims_insert_for_own_invoice on payment_claims;
create policy payment_claims_insert_for_own_invoice
  on payment_claims for insert
  to anon
  with check (
    exists (
      select 1 from invoices i
      join visits v on v.id = i.visit_id
      where i.id = payment_claims.invoice_id
        and v.patient_id = auth.jwt() ->> 'patient_id'
    )
  );

-- ─── cloud_heartbeat ─────────────────────────────────────────────────────
alter table cloud_heartbeat enable row level security;

drop policy if exists cloud_heartbeat_select_all on cloud_heartbeat;
create policy cloud_heartbeat_select_all
  on cloud_heartbeat for select
  to anon
  using (true);

-- ─── visits / invoices / patients — portal read scoping ──────────────────
-- Portal patients read only their OWN visits and invoices via JWT patient_id.
alter table visits enable row level security;
drop policy if exists visits_select_own on visits;
create policy visits_select_own
  on visits for select
  to anon
  using (patient_id = auth.jwt() ->> 'patient_id');

alter table invoices enable row level security;
drop policy if exists invoices_select_own on invoices;
create policy invoices_select_own
  on invoices for select
  to anon
  using (
    exists (
      select 1 from visits v
      where v.id = invoices.visit_id
        and v.patient_id = auth.jwt() ->> 'patient_id'
    )
  );

alter table patients enable row level security;
drop policy if exists patients_select_self on patients;
create policy patients_select_self
  on patients for select
  to anon
  using (id = auth.jwt() ->> 'patient_id');

-- visit_tests + results: scoped via the visit join.
alter table visit_tests enable row level security;
drop policy if exists visit_tests_select_own on visit_tests;
create policy visit_tests_select_own
  on visit_tests for select
  to anon
  using (
    exists (
      select 1 from visits v
      where v.id = visit_tests.visit_id
        and v.patient_id = auth.jwt() ->> 'patient_id'
    )
  );

alter table results enable row level security;
drop policy if exists results_select_own on results;
create policy results_select_own
  on results for select
  to anon
  using (
    exists (
      select 1 from visit_tests vt
      join visits v on v.id = vt.visit_id
      where vt.id = results.visit_test_id
        and v.patient_id = auth.jwt() ->> 'patient_id'
    )
  );
