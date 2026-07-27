-- Let staff see whether the lab desktop is still syncing.
--
-- The desktop is the master copy; both portals are read surfaces fed by its
-- outbox worker. When that worker wedges — a bad row, a dead network, the app
-- simply closed — the cloud keeps serving whatever it last received, and nothing
-- anywhere says so. Staff carry on entering results against a stale picture.
--
-- `cloud_heartbeat.last_pushed_at` already carries the signal (the desktop
-- writes it on every sync tick, and the patient portal reads it for its own
-- staleness banner) but the only select policy is for `anon`. The staff portal
-- queries with an authenticated staff JWT, so it currently sees nothing.
--
-- There is one row, holding one timestamp and no patient data.

drop policy if exists cloud_heartbeat_select_staff on cloud_heartbeat;
create policy cloud_heartbeat_select_staff
  on cloud_heartbeat for select
  to authenticated
  using (true);
