-- Phase 3e Plan G: settings, audit viewer, diagnostics, sign-out-everywhere.

-- ── sign-out-everywhere ──────────────────────────────────────────────────────
-- Stateless JWTs can't be revoked individually, so we bump a per-user epoch and
-- reject tokens minted (iat) before it. Cloud-only column (the desktop doesn't
-- mint these admin-portal tokens), so the Prisma User model is unchanged.
alter table users
  add column if not exists session_epoch bigint not null default 0;

-- The sign-out-everywhere route updates users.session_epoch with the user's own
-- (authenticated) token. Plan F enabled RLS on users with select-only, which would
-- block that write — so allow a user to update their OWN row, guarded by a trigger
-- that limits self-updates to session_epoch (no role / password_hash escalation).
-- Service-role writes (desktop sync, auth-login, change-password) carry no role_app
-- claim → jwt_role() = 'anon' → the guard is bypassed.
drop policy if exists users_update_own on users;
create policy users_update_own on users
  for update to authenticated
  using (id = jwt_user_id())
  with check (id = jwt_user_id());

create or replace function block_user_self_escalation()
returns trigger as $$
begin
  if jwt_role() in ('Admin', 'Staff') then
    if new.role                is distinct from old.role
       or new.password_hash    is distinct from old.password_hash
       or new.username         is distinct from old.username
       or new.is_active        is distinct from old.is_active
       or new.can_enter_results   is distinct from old.can_enter_results
       or new.can_collect_samples is distinct from old.can_collect_samples then
      raise exception 'self-update is limited to session_epoch';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_block_user_self_escalation on users;
create trigger trg_block_user_self_escalation
  before update on users
  for each row execute function block_user_self_escalation();

-- ── lab_settings: admin read/write ───────────────────────────────────────────
-- RLS is already enabled with an anon `public_read` (portal Lab Info). The admin
-- portal runs as the `authenticated` role, which the anon policy does not cover —
-- add authenticated read for staff and update for Admin (UPI VPA edit).
drop policy if exists lab_settings_staff_select on lab_settings;
create policy lab_settings_staff_select on lab_settings
  for select to authenticated
  using (jwt_role() in ('Admin', 'Staff'));

drop policy if exists lab_settings_admin_update on lab_settings;
create policy lab_settings_admin_update on lab_settings
  for update to authenticated
  using (jwt_role() = 'Admin')
  with check (jwt_role() = 'Admin');
