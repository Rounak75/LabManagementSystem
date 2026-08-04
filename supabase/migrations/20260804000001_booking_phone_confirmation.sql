-- Phase 3g — record the outcome of the staff confirmation call on a booking.
--
-- Staff already ring every booking before approving it. Until now that call
-- left no trace, so a number nobody could reach looked exactly like one that
-- was confirmed — and an approved booking writes its phone onto a real Patient,
-- where it becomes that patient's portal login.
--
-- These columns are written by the desktop at approval and pushed up by the
-- outbox. The outbox sends every scalar on the row, so the cloud table has to
-- carry them or every booking push fails with PGRST204 (non-retryable).

alter table public.bookings
  add column if not exists phone_confirm_outcome text,
  add column if not exists phone_confirmed_at    timestamptz,
  add column if not exists phone_confirmed_by_id text;

-- Only the two outcomes the approve dialog can produce. Null stays legal:
-- every booking approved before this migration has no call recorded, and
-- back-filling them with a guess would assert a call that never happened.
alter table public.bookings
  drop constraint if exists bookings_phone_confirm_outcome_check;

alter table public.bookings
  add constraint bookings_phone_confirm_outcome_check
  check (phone_confirm_outcome is null or phone_confirm_outcome in ('Reached', 'NoAnswer'));
