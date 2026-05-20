-- Phase 3e Plan A: RLS policies for admin portal access.
-- Convention: staff JWTs carry { user_id, role, lab_id } as custom claims.
-- Service-role key bypasses RLS (used by Edge Functions internally).

-- 1. Helper functions: extract role + user_id from JWT.
-- NB: the JWT's standard `role` claim is "authenticated" (the PostgREST role);
-- the app-specific Admin/Staff role is carried in the custom `role_app` claim
-- minted by the auth-login Edge Function.
create or replace function jwt_role() returns text as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role_app', 'anon');
$$ language sql stable;

create or replace function jwt_user_id() returns text as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'user_id', '');
$$ language sql stable;

-- 2. Enable RLS on new tables
alter table id_reservations enable row level security;
alter table print_jobs enable row level security;
alter table client_errors enable row level security;

-- 3. id_reservations — staff can read all (to see existing numbers); only
-- inserts via Edge Function (service role bypasses RLS). No web inserts.
create policy id_reservations_select on id_reservations
  for select to authenticated using (jwt_role() in ('Admin', 'Staff'));

-- 4. print_jobs — staff can read all; only Admin role can insert (father
-- prints from his phone). Update/delete via service role only.
create policy print_jobs_select on print_jobs
  for select to authenticated using (jwt_role() in ('Admin', 'Staff'));
create policy print_jobs_insert_admin on print_jobs
  for insert to authenticated with check (jwt_role() = 'Admin');

-- 5. client_errors — any authenticated client can insert their own; only
-- Admin can read.
create policy client_errors_insert on client_errors
  for insert to authenticated with check (true);
create policy client_errors_select_admin on client_errors
  for select to authenticated using (jwt_role() = 'Admin');

-- 6. Extend existing patient/visit/results/payments policies (additive).
-- Admin staff need write access to patients/visits/results/payments via their JWT.

drop policy if exists patients_admin_write on patients;
create policy patients_admin_write on patients
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));

drop policy if exists visits_admin_write on visits;
create policy visits_admin_write on visits
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (
    jwt_role() in ('Admin', 'Staff')
    -- Column-level guard for verified_at / verified_by_user_id is enforced by
    -- the block_staff_verify_write() trigger below.
  );

drop policy if exists results_admin_write on results;
create policy results_admin_write on results
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));

drop policy if exists payments_admin_write on payments;
create policy payments_admin_write on payments
  for all to authenticated
  using (jwt_role() in ('Admin', 'Staff'))
  with check (jwt_role() in ('Admin', 'Staff'));

-- 7. Trigger: block Staff from writing verify columns on visits.
create or replace function block_staff_verify_write()
returns trigger as $$
begin
  if jwt_role() = 'Staff' then
    if (new.verified_at is distinct from old.verified_at)
       or (new.verified_by_user_id is distinct from old.verified_by_user_id) then
      raise exception 'Staff cannot set verified_at / verified_by_user_id';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_block_staff_verify_write on visits;
create trigger trg_block_staff_verify_write
  before update on visits
  for each row execute function block_staff_verify_write();
