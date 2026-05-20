-- Phase 3e Plan F: payments + bookings management from the admin portal.

-- ── payments ─────────────────────────────────────────────────────────────────
-- The shipped pull-payments.ts reads `reference`, `received_at` and filters on
-- `updated_at` (.gt("updated_at", since)), but the Phase 3c init table had none
-- of these — so admin-recorded payments would never sync. Add them.
alter table payments
  add column if not exists reference  text,
  add column if not exists received_at timestamptz,
  add column if not exists updated_at  timestamptz;

-- ── payment_claims ───────────────────────────────────────────────────────────
-- The model is a soft "I already paid" signal (no amount). Add a small
-- resolution trail so the admin portal can mark a claim handled/dismissed.
-- Recording the actual payment is done via the Mark-UPI-received flow.
alter table payment_claims
  add column if not exists status              text not null default 'Open',
  add column if not exists resolved_at         timestamptz,
  add column if not exists resolved_by_user_id text;

-- ── RLS: admin-portal writes ─────────────────────────────────────────────────
-- Plan A added admin-write policies for patients/visits/results/payments/visit_tests
-- but NOT invoices/bookings/payment_claims, which Plan F writes to. Add them.
-- (jwt_role() helper defined in 20260520000002.)

alter table invoices enable row level security;
drop policy if exists invoices_admin_write on invoices;
create policy invoices_admin_write on invoices
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));

alter table bookings enable row level security;
drop policy if exists bookings_admin_write on bookings;
create policy bookings_admin_write on bookings
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));

alter table payment_claims enable row level security;
drop policy if exists payment_claims_admin_write on payment_claims;
create policy payment_claims_admin_write on payment_claims
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));

-- ── users ────────────────────────────────────────────────────────────────────
-- The cloud users mirror (Plan A) had RLS left disabled, so password_hash was
-- readable by anyone with the anon key. Enable RLS and scope reads to staff JWTs
-- (the bookings UI lists phlebotomists). Desktop sync + the auth Edge Function
-- use the service-role key, which bypasses RLS, so login/sync are unaffected.
alter table users enable row level security;
drop policy if exists users_select_staff on users;
create policy users_select_staff on users
  for select to authenticated
  using (jwt_role() in ('Admin', 'Staff'));
