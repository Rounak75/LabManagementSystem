-- The human-facing visit number must be unique in the cloud too.
--
-- `Visit.visitId` is `@unique` in the local schema and `patients.patient_id` got
-- its unique index in 20260520000003_phase_3e_align_cloud_schema. `visits.visit_id`
-- was missed in that same pass, so the cloud has been the one place a
-- VIS-YYYY-NNNNN could be duplicated.
--
-- That matters because two allocators mint these codes and share no state:
--   * the staff portal, via the reserve-visit-id Edge Function, reading cloud
--     `id_reservations`;
--   * the lab desktop, in id-generator.ts, reading its own local high-water mark.
--
-- Nothing pulls `id_reservations` down to the desktop, so while the desktop is
-- offline — the state the whole offline-first architecture exists to support — it
-- cannot see what the portal has handed out, and both can pick the same number.
-- Without this index the cloud accepted that silently and two patients ended up
-- with one report number. With it, the second write is refused while it is still
-- a failed request rather than a printed report.
--
-- Both callers already cope:
--   * /api/visits/create maps this constraint by name to a 409 telling staff to
--     press Create again — the form reserves a fresh code on every submit, so the
--     retry succeeds.
--   * the desktop's outbox classifies a 4xx as non-retryable, so the row is marked
--     Failed and counted in the sync status card rather than retried forever.
--
-- The desktop pushes visits with `upsert(..., { onConflict: "id" })`, so
-- re-pushing an existing visit updates that row in place and cannot trip this.

-- Refuse to add the index while the data would not satisfy it, and say exactly
-- which numbers are the problem. Without this the failure is Postgres's own
-- "could not create unique index ... is duplicated", which names no rows and
-- leaves the owner with nothing to act on.
do $$
declare
  dupes text;
begin
  select string_agg(visit_id || ' (' || n || ' visits)', ', ' order by visit_id)
    into dupes
    from (
      select visit_id, count(*) as n
        from public.visits
       where visit_id is not null
       group by visit_id
      having count(*) > 1
    ) d;

  if dupes is not null then
    raise exception
      'Cannot add the unique index on visits.visit_id — these numbers are on more than one visit: %. List them with:  select id, visit_id, patient_id, created_at from public.visits where visit_id in (select visit_id from public.visits where visit_id is not null group by visit_id having count(*) > 1) order by visit_id, created_at;  Keep the number on the earliest visit of each group, give the later one an unused number, then run this migration again.',
      dupes;
  end if;
end $$;

-- Partial because `visit_id` is nullable here: a plain unique index would permit
-- multiple NULLs anyway, but saying so keeps the intent explicit and leaves any
-- legacy un-numbered row out of the index entirely.
--
-- The name is load-bearing: apps/admin/src/app/api/visits/create/route.ts matches
-- on `visits_visit_id_key` to tell this race apart from any other unique
-- violation. Renaming the index without changing that turns a clear "press Create
-- again" back into an opaque 500.
create unique index if not exists visits_visit_id_key
  on public.visits (visit_id)
  where visit_id is not null;
