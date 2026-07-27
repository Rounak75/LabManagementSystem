# Patient portal → Vercel + Supabase

The patient portal (`apps/portal`, package `@lab/portal`) is what patients open
on their own phones to read a report, pay, and request a home visit.

This runbook owns the **migration order**. Do this one first.

---

## 1. Create the Supabase project

One project serves the patient portal, the staff portal and the desktop sync.

1. Supabase → **New project**. Choose the region closest to Jamshedpur
   (`ap-south-1`, Mumbai).
2. Save the database password somewhere durable — you need it for
   `SUPABASE_DB_URL` in `backup-and-restore.md`.
3. **Project Settings → API** — keep this tab open, you need three values from it.

## 2. Apply migrations, in order

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

`supabase db push` applies `supabase/migrations/*.sql` in filename order, which
is the order they must run in. Do not apply them by hand out of order — several
later ones alter tables the earlier ones create, and the RLS migrations assume
the tables already exist.

The sequence matters most here:

| Migration | Why the order matters |
|-----------|----------------------|
| `20260518000001_init_synced_tables` | Creates everything else's dependencies |
| `20260518000005_rls_policies` | Enables RLS. Until this runs the tables are open |
| `20260519000002_phase_3d_portal_rls` | Patient-scoped read policies |
| `20260521000001_phase_3e_add_foreign_keys` | Fails if any earlier table is missing |
| `20260727000007_close_anon_bookings_access` | Drops the anon read/write grants on `bookings` |
| `20260727000008_close_anon_patient_account_writes` | Drops the anon UPDATE on `patient_accounts` |
| `20260727000009_retention_for_unpruned_tables` | Needs `pg_cron`, enabled in `20260518000006` |

Verify RLS is actually on before going further:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

That must return **zero rows**. Any table listed is readable by anyone holding
the anon key, which is published in the browser bundle.

## 3. Import the project on Vercel

| Setting | Value |
|---------|-------|
| Framework preset | Next.js |
| Root directory | `apps/portal` |
| Build command | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @lab/portal build` |
| Node version | 20.x |

## 4. Environment variables

| Variable | Source | Exposed to browser? |
|----------|--------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` public | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` | **No. Bypasses RLS entirely.** |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Secret | **No.** |
| `PORTAL_BASE_URL` | The deployed URL, e.g. `https://golmurijanchghar.vercel.app` | Yes, but set it server-side |

The portal holds the service role key because it must look a patient up *before*
they have a JWT — see `getServiceClient()` in `src/lib/supabase-server.ts`. Every
route handler that uses it is server-side. If it ever appears in a
`NEXT_PUBLIC_` variable, rotate it immediately (see `key-rotation.md`).

## 5. Uptime monitoring — not optional on the free plan

A free Supabase project **pauses after 7 days of inactivity** and only a manual
click in the dashboard brings it back. A festival week with the lab shut is
enough to trigger it, and nothing tells you until a patient cannot load a report.

`/api/health` exists for this. It makes a real query — so polling it both proves
the portal is up and keeps the project awake.

Set up a free monitor (UptimeRobot, cron-job.org, or Better Stack):

- **URL**: `https://<your-portal>/api/health`
- **Interval**: 15 minutes
- **Alert on**: HTTP status ≠ 200
- **Notify**: the owner's email and phone

The response also carries `syncFresh` and `syncAgeMinutes`, reporting how long
ago the desktop last pushed. That is deliberately **not** part of the pass/fail:
the home PC being off overnight is normal, and alerting on it teaches everyone to
ignore the alerts. If you want a separate sync alarm, add a second keyword
monitor looking for `"syncFresh":false` and give it a much longer confirmation
window.

## 6. Launch checks

1. `/` loads; lab name, address and hours are correct.
2. `/info` shows today's open/closed state correctly — check it in the evening
   too, the lab is closed Sunday evening.
3. `/book` renders, the captcha appears, and a booking submits.
4. Submitting the same phone + date twice inside 5 minutes returns the **same**
   booking id rather than creating two.
5. `/book/status/<id>` shows the booking; a booking older than 7 days shows the
   "call the lab" message instead.
6. Patient login with phone + printed access code works.
7. A patient with two records on one phone number gets the chooser.
8. A report **does not** appear until an Admin has verified and locked every test
   in the visit.
9. The PDF renders, and abnormal values are visibly distinct.
10. Invoice page shows the UPI QR; a payment claim submits.
11. Log in as patient A, then try patient B's visit id directly — must 404.
12. `/dashboard` while logged out redirects to `/login`.
13. `/api/health` returns 200 with `"database":"reachable"`.
14. With the anon key from the browser bundle, `GET /rest/v1/bookings?select=*`
    returns **zero rows** — this is the check that
    `20260727000007_close_anon_bookings_access` actually applied.
15. Same key, `PATCH /rest/v1/patient_accounts` — must be refused.
16. Desktop shows the booking within ~10 seconds of submission.
17. Approving from the staff portal flows back to the patient's status page.

Checks 14 and 15 are the ones worth repeating after any migration change. They
are the difference between "RLS is configured" and "RLS is working".

## 7. Troubleshooting

**All queries return empty, no error.** JWT secret mismatch. The portal signs
patient tokens with `SUPABASE_JWT_SECRET`; if Supabase disagrees, every policy
that reads `auth.jwt() ->> 'patient_id'` sees null and matches nothing.

**Bookings submit but the desktop never sees them.** Cloud sync is off, or the
service key on the desktop is stale — Settings → Cloud sync on the desktop.

**Reports show as unavailable for a verified visit.** Every test in the visit
must be locked, not just one. `isReportReleasable` requires all of them.
