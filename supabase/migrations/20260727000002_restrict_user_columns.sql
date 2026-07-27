-- Stop staff accounts being able to read every user's password hash.
--
-- `users_select_staff` grants `for select to authenticated using (jwt_role() in
-- ('Admin','Staff'))`. RLS filters rows, not columns, so that policy exposed
-- every column of every user — including `password_hash` — to any Staff account.
-- The anon key is public, so this needed no access to the portal: a staff JWT
-- plus a direct PostgREST request returned all hashes, which is a Staff → Admin
-- escalation path via offline cracking, and it also leaked `failed_attempts` and
-- `locked_until`.
--
-- Postgres column-level privileges are the precise fix: RLS keeps deciding which
-- rows are visible, while the grant decides which columns. The admin portal only
-- ever reads id, name, username and session_epoch, and filters on
-- can_collect_samples / is_active (see data-audit.ts, data-bookings.ts,
-- auth-session.ts), so no application query changes.
--
-- service_role bypasses both RLS and these grants, so the desktop sync worker,
-- auth-login and change-password Edge Functions are unaffected — they remain the
-- only things that can see a password hash.

revoke select on public.users from authenticated;
revoke update on public.users from authenticated;

grant select (
  id,
  name,
  username,
  role,
  is_active,
  can_enter_results,
  can_collect_samples,
  session_epoch
) on public.users to authenticated;

-- "Sign out everywhere" updates the caller's own session_epoch (policy
-- users_update_own, guarded by block_user_self_escalation). That is the only
-- column a signed-in user may write on their own row.
grant update (session_epoch) on public.users to authenticated;

-- anon (the patient portal) has no business reading staff accounts at all.
revoke all on public.users from anon;
