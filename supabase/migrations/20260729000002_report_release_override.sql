-- Let an Admin hand over an unpaid report anyway, per visit.
--
-- The patient portal now withholds the PDF while money is still owed. That is
-- right for a walk-in, but wrong for a regular the lab has always extended credit
-- to, and wrong when the patient paid in a way the system has not caught up with
-- yet. Without a release valve the staff's only options would be to record a
-- payment that never happened — which corrupts the day's takings — or to tell the
-- patient their report does not exist.
--
-- Recorded per visit rather than per patient, and with who and when, because it
-- is a decision about money that someone may have to answer for later.

alter table visits
  add column if not exists report_release_override            boolean not null default false,
  add column if not exists report_release_override_by_user_id text,
  add column if not exists report_release_override_at         timestamptz,
  add column if not exists report_release_override_reason     text;

-- The portal reads this on the report path for every visit it renders.
create index if not exists visits_report_release_override_idx
  on visits (report_release_override)
  where report_release_override;
