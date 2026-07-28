-- Make verifying in the staff portal actually finish the job.
--
-- /api/visits/[id]/verify and /api/visits/batch-verify set visits.status and
-- results.verified_at, and stopped there. Two things followed from that:
--
--  1. visit_tests.is_locked was never set. That column is what the patient
--     portal's report gate reads, so a visit the owner had verified still told
--     the patient "your report is still being checked by the lab" — forever. It
--     is also what block_write_to_locked_result() keys off, so a signed-off
--     result stayed editable by any Staff token, which is the invariant that
--     trigger exists to defend.
--
--  2. visits.status was set to 'Verified', which nothing reads. The desktop, the
--     staff portal's Completed tab and the patient dashboard all look for
--     'Completed'. A verified visit therefore left "Awaiting verify" without
--     arriving anywhere else.
--
-- The end state here is the desktop's own verify-lock end state (visits.ipc
-- `visitTests:lock`), which pull-verifications already mirrors: every test
-- locked and Ready, the visit Completed.
--
-- Order matters. block_write_to_locked_result() rejects writes to results whose
-- parent visit_test is locked, so results.verified_at has to be stamped BEFORE
-- the tests are locked -- doing it the other way round makes the function fail
-- against its own trigger.

create or replace function verify_visits(
  p_visit_ids text[],
  p_user_id   text
)
returns table (visit_id text, tests_locked bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  -- SECURITY DEFINER bypasses RLS, so the role check the policies would have
  -- done happens here. Verifying is the owner's sign-off, not the front desk's.
  if jwt_role() <> 'Admin' then
    raise exception 'not authorised' using errcode = 'insufficient_privilege';
  end if;

  if p_visit_ids is null or coalesce(array_length(p_visit_ids, 1), 0) = 0 then
    raise exception 'no visits given' using errcode = 'check_violation';
  end if;

  -- 1. Stamp the results while their parent tests are still unlocked.
  --
  -- Restricted to tests that are not already locked, which makes verifying twice
  -- harmless. Without that restriction, re-verifying — a second click, or a batch
  -- that happens to include an already-verified visit — would try to write to
  -- results under a locked test and be rejected by block_write_to_locked_result,
  -- so the whole call failed with a message about editing signed-off results that
  -- had nothing to do with what the user did.
  update results r
     set verified_at = v_now
   where r.visit_test_id in (
     select vt.id
       from visit_tests vt
      where vt.visit_id = any(p_visit_ids)
        and coalesce(vt.is_locked, false) = false
   );

  -- 2. Lock and finish the tests. 'Ready' is the terminal per-test status the
  --    desktop uses once a whole visit is signed off.
  update visit_tests vt
     set is_locked      = true,
         verified_at    = v_now,
         verified_by_id = p_user_id,
         status         = 'Ready',
         updated_at     = v_now
   where vt.visit_id = any(p_visit_ids);

  -- 3. Finish the visits.
  update visits v
     set status              = 'Completed',
         verified_at         = v_now,
         verified_by_user_id = p_user_id,
         updated_at          = v_now
   where v.id = any(p_visit_ids);

  return query
    select v.id, count(vt.id)
      from visits v
      left join visit_tests vt on vt.visit_id = v.id
     where v.id = any(p_visit_ids)
     group by v.id;
end;
$$;

revoke execute on function verify_visits(text[], text) from public, anon;
grant  execute on function verify_visits(text[], text) to authenticated, service_role;
