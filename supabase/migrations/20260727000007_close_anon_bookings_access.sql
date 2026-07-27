-- Close the two anon grants on `bookings`.
--
-- The anon key is public by design — it ships inside the patient portal's
-- browser bundle, so every policy granted `to anon` is a policy granted to
-- anyone who opens DevTools. Two of them on this table were never needed.
--
-- 1. `bookings_select_recent` allowed anon to SELECT every row created in the
--    trailing seven days. `bookings` holds patient_name, patient_phone,
--    patient_email, address, pincode and source_ip, so one unauthenticated
--    request to /rest/v1/bookings?select=* returned the name, phone number and
--    home address of everybody who booked a home visit that week. Nothing in
--    the app relied on it: the public booking-status page reads through
--    getServiceClient(), which bypasses RLS entirely
--    (apps/portal/src/app/book/status/[bookingId]/page.tsx).
--
-- 2. `bookings_insert_anon` was `with check (true)` — an unconditional write
--    grant. The puzzle captcha, the 10-digit phone check and the five-minute
--    duplicate window all live in the Next route handler, so PostgREST was a
--    second door with none of them on it: unlimited fabricated bookings for
--    staff to phone through, and unbounded writes against a 500 MB database.
--    The portal's own insert also goes through the service client
--    (apps/portal/src/app/api/bookings/route.ts), so this grant had no caller.
--
-- Dropping both leaves service_role — the desktop sync worker, the portal's
-- route handlers and the admin portal's approve/decline routes — as the only
-- things that can read or write this table. That is already how every code path
-- reaches it today.

drop policy if exists bookings_select_recent on public.bookings;
drop policy if exists bookings_insert_anon   on public.bookings;

-- Belt and braces. Dropping a policy stops RLS from granting access, but the
-- table-level privilege is a separate mechanism: if RLS were ever disabled on
-- this table by accident, a lingering GRANT would expose it again immediately.
-- anon has no business touching bookings by any route.
revoke all on public.bookings from anon;
