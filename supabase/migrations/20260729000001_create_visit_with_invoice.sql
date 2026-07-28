-- Give every staff-portal visit an invoice, and let the counter payment be
-- recorded with it.
--
-- The desktop's VisitOrchestrator creates a visit and its invoice together, but
-- /api/visits/create inserted only the visit and its visit_tests, and
-- pull-visits.ts did not create one on the way down either. So a visit registered
-- from a phone — the path the whole system exists to enable — had no invoice
-- anywhere, ever. Everything downstream reads invoices: /payments lists them, the
-- patient portal's Pay button reads them, the dashboard totals count them. All of
-- it silently skipped exactly the patients staff entered at the lab, and there was
-- nowhere to record the cash the patient handed over.
--
-- Doing it in one function also closes a smaller hole in the old route: the visit
-- and its visit_tests were two separate inserts, so a failure on the second left a
-- visit with no tests on it.

create or replace function create_visit_with_invoice(
  p_id             text,
  p_visit_code     text,
  p_patient_id     text,
  p_visit_date     timestamptz,
  p_staff_id       text,
  p_test_ids       text[],
  p_amount_paid    numeric default 0,
  p_payment_method text default null,
  p_received_by    text default null
)
returns table (visit_id text, invoice_id text, subtotal numeric, amount_paid numeric, payment_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_invoice_id text := gen_random_uuid()::text;
  v_subtotal   numeric;
  v_found      bigint;
  v_status     text;
  v_paid       numeric := coalesce(p_amount_paid, 0);
  v_wanted     int := coalesce(array_length(p_test_ids, 1), 0);
begin
  -- SECURITY DEFINER bypasses RLS, so the role check the invoices/visits policies
  -- would have done has to happen here instead.
  if jwt_role() not in ('Admin', 'Staff') then
    raise exception 'not authorised' using errcode = 'insufficient_privilege';
  end if;

  if v_wanted = 0 then
    raise exception 'a visit needs at least one test' using errcode = 'check_violation';
  end if;

  -- Collapse repeats before pricing. The same test id sent twice would otherwise
  -- add the test to the visit twice and charge the patient for both, and would
  -- also fail the existence check below (two ids wanted, one row found) with a
  -- misleading "test does not exist".
  p_test_ids := (select array_agg(distinct x) from unnest(p_test_ids) as x);
  v_wanted := coalesce(array_length(p_test_ids, 1), 0);
  if v_paid < 0 then
    raise exception 'payment amount cannot be negative' using errcode = 'check_violation';
  end if;

  -- Price the visit from the catalogue rather than from a total sent by the
  -- browser, so a tampered request cannot bill a patient the wrong amount.
  select coalesce(sum(t.price), 0), count(*)
    into v_subtotal, v_found
    from tests t
   where t.id = any(p_test_ids);

  if v_found <> v_wanted then
    raise exception 'one or more tests do not exist' using errcode = 'foreign_key_violation';
  end if;

  -- Overpayment at the counter is a typo, not a tip. Reject it rather than
  -- recording a credit the rest of the system has no concept of.
  if v_paid > v_subtotal then
    raise exception 'payment exceeds the visit total' using errcode = 'check_violation';
  end if;

  insert into visits (id, visit_id, patient_id, visit_date, type, staff_id, status, source, created_at, updated_at)
  values (p_id, p_visit_code, p_patient_id, p_visit_date, 'WalkIn', p_staff_id, 'Open', 'admin', v_now, v_now);

  insert into visit_tests (id, visit_id, test_id, status, created_at, updated_at)
  select gen_random_uuid()::text, p_id, tid, 'Collected', v_now, v_now
    from unnest(p_test_ids) as tid;

  -- A zero-priced visit (all tests free, or a catalogue with no price set) is
  -- settled on creation; there is nothing for the patient to pay later.
  v_status := case
    when v_paid >= v_subtotal then 'Paid'
    when v_paid > 0           then 'Partial'
    else                           'Pending'
  end;

  insert into invoices (
    id, visit_id, subtotal, discount_amount, total,
    payment_method, payment_status, amount_paid, created_at, updated_at
  )
  values (
    v_invoice_id, p_id, v_subtotal, 0, v_subtotal,
    case when v_paid > 0 then p_payment_method end, v_status, v_paid, v_now, v_now
  );

  if v_paid > 0 then
    insert into payments (
      id, invoice_id, amount, method, reference,
      received_by_user_id, received_at, source, created_at, updated_at
    )
    values (
      gen_random_uuid()::text, v_invoice_id, v_paid, coalesce(p_payment_method, 'Cash'), null,
      p_received_by, v_now, 'admin', v_now, v_now
    );
  end if;

  visit_id       := p_id;
  invoice_id     := v_invoice_id;
  subtotal       := v_subtotal;
  amount_paid    := v_paid;
  payment_status := v_status;
  return next;
end;
$$;

revoke execute on function create_visit_with_invoice(text, text, text, timestamptz, text, text[], numeric, text, text) from public, anon;
grant  execute on function create_visit_with_invoice(text, text, text, timestamptz, text, text[], numeric, text, text) to authenticated, service_role;
