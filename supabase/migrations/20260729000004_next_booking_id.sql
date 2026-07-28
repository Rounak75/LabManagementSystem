-- Allocate home-collection booking numbers without two patients colliding.
--
-- The portal minted BKG-YYYY-NNNNN by counting the year's bookings and adding
-- one. Two people booking at the same moment both counted the same total and
-- both built the same id; `bookings.booking_id` is unique, so the second insert
-- failed and that patient's request was simply lost, with a generic error on
-- their phone. It fails precisely when the lab is busiest, which is also when a
-- lost home visit costs the most.
--
-- Visits already had this solved: reserve-visit-id allocates from
-- id_reservations, whose (prefix, number) is unique. Bookings never got the same
-- treatment. This reuses that table — it is a generic prefix/number allocator —
-- and takes a transaction-scoped advisory lock on the prefix so concurrent
-- callers queue rather than race. The lock is released when the statement's
-- transaction ends, including on error.

create or replace function next_booking_id(p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_number int;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'invalid year %', p_year using errcode = 'check_violation';
  end if;

  v_prefix := 'BKG-' || p_year::text || '-';

  -- Serialise allocation for this prefix. Without it, two callers read the same
  -- max and insert the same number; one of them loses on the unique index.
  perform pg_advisory_xact_lock(hashtext(v_prefix));

  select coalesce(max(number), 0) + 1
    into v_number
    from id_reservations
   where prefix = v_prefix;

  -- Numbers come from this table rather than from a count of bookings, so a
  -- deleted or purged booking cannot hand its number to a later one.
  insert into id_reservations (prefix, number, reserved_by, source)
  values (v_prefix, v_number, 'portal', 'admin');

  return v_prefix || lpad(v_number::text, 5, '0');
end;
$$;

-- Called server-side by the portal's service client. anon has no business
-- allocating ids directly.
revoke execute on function next_booking_id(int) from public, anon;
grant  execute on function next_booking_id(int) to service_role;
