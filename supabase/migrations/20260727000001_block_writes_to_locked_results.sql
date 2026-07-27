-- Enforce the verified-and-locked invariant in the database.
--
-- The desktop refuses to modify a result whose visit test is locked
-- (results.ipc: `if (vt.isLocked) throw FORBIDDEN`), because a locked test has
-- been verified and signed off and its report may already be printed and handed
-- to the patient. That guard existed only in the desktop UI path.
--
-- `results_admin_write` grants `for all to authenticated` with no reference to
-- lock state, so any Admin or Staff JWT could update a signed-off result — and
-- because the anon key is public, without going through the portal at all: a
-- direct PostgREST request with a staff token was enough. The desktop then
-- pulled the change down into the master copy.
--
-- The application layer now checks this too (result-write.ts `assertNotLocked`),
-- which is what produces a friendly error in the UI. This trigger is the
-- backstop that cannot be bypassed by talking to PostgREST directly.
--
-- Admin is blocked as well as Staff. Unlocking is a separate, audited action;
-- an Admin who needs to correct a signed-off result unlocks the test first,
-- exactly as on the desktop. Service-role callers (the desktop sync worker and
-- the Edge Functions) carry no `role_app` claim, so `jwt_role()` returns 'anon'
-- and they are unaffected — the desktop remains the authority on its own data.

create or replace function block_write_to_locked_result()
returns trigger as $$
declare
  parent_locked boolean;
begin
  if jwt_role() in ('Admin', 'Staff') then
    select is_locked into parent_locked
      from visit_tests
      where id = new.visit_test_id;

    -- `is_locked` is nullable on clouds predating the column; null means unlocked.
    if coalesce(parent_locked, false) then
      raise exception
        'This test has been verified and locked. Unlock it before editing results.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_block_write_to_locked_result on results;
create trigger trg_block_write_to_locked_result
  before insert or update on results
  for each row execute function block_write_to_locked_result();

-- The trigger looks the parent up on every result write; keep that a PK hit.
create index if not exists results_visit_test_id_idx on results (visit_test_id);
