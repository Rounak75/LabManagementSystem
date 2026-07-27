-- Make recording a payment atomic.
--
-- `/api/payments/mark-received` read `amount_paid`, added the new payment in
-- JavaScript, and wrote the total back. Two staff recording payments against the
-- same invoice at the same time both read the same starting balance and both
-- wrote their own total, so one payment vanished from the invoice while its
-- `payments` row still existed — the invoice then disagreed with its own payment
-- history, and a patient could be chased for money they had paid.
--
-- Doing the arithmetic in one UPDATE means concurrent callers serialise on the
-- row and each payment counts exactly once.

create or replace function record_invoice_payment(
  p_invoice_id  text,
  p_amount      numeric,
  p_method      text,
  p_reference   text,
  p_received_by text
)
returns table (payment_id text, amount_paid numeric, payment_status text)
language plpgsql
security definer
as $$
declare
  v_payment_id text := gen_random_uuid()::text;
  v_now        timestamptz := now();
  v_total      numeric;
  v_paid       numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive' using errcode = 'check_violation';
  end if;

  -- Lock the invoice for the duration of the transaction so a concurrent call
  -- waits here rather than reading a balance that is about to change.
  select i.total into v_total from invoices i where i.id = p_invoice_id for update;
  if v_total is null then
    raise exception 'invoice not found: %', p_invoice_id using errcode = 'no_data_found';
  end if;

  insert into payments (
    id, invoice_id, amount, method, reference,
    received_by_user_id, received_at, source, created_at, updated_at
  )
  values (
    v_payment_id, p_invoice_id, p_amount, p_method, p_reference,
    p_received_by, v_now, 'admin', v_now, v_now
  );

  update invoices i
     set amount_paid = coalesce(i.amount_paid, 0) + p_amount,
         payment_status = case
           when coalesce(i.amount_paid, 0) + p_amount >= i.total then 'Paid'
           else 'Partial'
         end,
         updated_at = v_now
   where i.id = p_invoice_id
  returning i.amount_paid, i.payment_status into v_paid, payment_status;

  payment_id := v_payment_id;
  amount_paid := v_paid;
  return next;
end;
$$;

-- Staff record payments through the portal with their own JWT, so unlike the
-- login counters this one is callable by authenticated users. RLS on invoices and
-- payments still applies to everything else they do; this function is narrow
-- enough to be safe as SECURITY DEFINER: it only ever appends a payment and
-- recomputes that invoice's balance from its own previous value.
revoke execute on function record_invoice_payment(text, numeric, text, text, text) from public, anon;
grant execute on function record_invoice_payment(text, numeric, text, text, text) to authenticated, service_role;
