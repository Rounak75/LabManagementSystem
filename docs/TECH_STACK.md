# Tech stack, and why each piece is here

Three apps and three shared packages in one pnpm + Turborepo monorepo. Every
choice below was made under two constraints that never relaxed: **it has to cost
nothing to run**, and **there is one machine**.

---

## Layout

```
apps/
  desktop/   @lab/desktop   Electron + React    The print station and master copy
  admin/     @lab/admin     Next.js 15          Staff portal (phones, at the lab)
  portal/    @lab/portal    Next.js 15          Patient portal (patients' phones)
packages/
  db/        @lab/db        Prisma + SQLite     Schema, migrations, seed
  reports/   @lab/reports   @react-pdf/renderer The printed report
  types/     @lab/types     Zod                 Shared shapes and validators
supabase/                                       Migrations + Edge Functions
```

## The shape of the system

SQLite on the lab PC is the **master**. Supabase is a **read surface plus an
inbox** — patients read from it, staff write into it, and the desktop reconciles.

This is inverted from the usual arrangement, and it is deliberate. The lab's
internet is mobile data. A cloud-primary design stops the lab working when the
connection drops, which is unacceptable for a business that cannot tell a patient
to come back tomorrow. A local-primary design degrades to "the portals are stale"
instead — annoying, not blocking.

## Choices worth explaining

**Electron, not a web app on the lab PC.** The desktop has to print to a Windows
printer with per-printer calibration, hold the master database offline, and run a
scheduled backup while nobody is watching. A browser tab does none of those.

**SQLite via Prisma, not Postgres locally.** One file, no service to install or
keep running, and `VACUUM INTO` gives a consistent backup in one statement. On a
single unattended PC, "no daemon to fail" is a feature.

**Supabase, not a hand-rolled API.** The free tier includes Postgres, RLS,
auth-adjacent primitives, Edge Functions and pg_cron. Row-level security in
particular means the access rules live in the database rather than in whichever
route handler remembered to check — which matters when two separate Next apps and
a desktop sync worker all touch the same rows.

**Next.js App Router for both portals.** Server components keep the service-role
key server-side by construction. Route handlers give a place for logic that must
not be in the browser.

**Two Next apps, not one with role routing.** Patients and staff have different
threat models. A bug in a patient-facing page cannot reach a staff-only route if
staff routes are not in that deployment at all.

**Zod at the boundaries.** Anything arriving from the network — a booking form, a
sync payload, a JWT claim set — is parsed, not cast. `assertStaffClaims` is the
clearest example: a valid signature only proves the token came from this
deployment, since the patient portal signs with the same secret.

**`@react-pdf/renderer` for reports.** The PDF is what the patient physically
holds and what a doctor reads, so it has to be deterministic and testable. It is
the one place where "it looked fine when I tried it" is not good enough — the
report tests drive the real engine and are mutation-checked.

**Turborepo.** Six packages with a real dependency graph; without caching, CI
rebuilds everything on every push and the free Actions minutes go to waste.

## Things that are deliberately absent

**No ORM in the cloud.** The portals talk to PostgREST through `supabase-js`.
Adding Prisma there would mean a second schema definition to keep in step with
`supabase/migrations/`, and drift between them is exactly the failure that
`schema-drift.ts` exists to catch on the desktop side.

**No state management library in the portals.** Server components plus URL state
cover it. `zustand` is in the desktop, where there is genuine long-lived client
state.

**No error-tracking SDK yet.** `client_errors` is a table the desktop and portals
write to. Nothing alerts on it — that is a known gap, listed in the audit.

**No test database.** Tests stub Supabase (`src/test/supabase-stub.ts`) and use
real SQLite for anything that touches Prisma. Nothing in CI needs a live cloud,
which keeps the pipeline free and offline-runnable.

## Versions that matter

| Thing | Version | Note |
|-------|---------|------|
| Node | ≥ 20.10 | Pinned in `.nvmrc`, enforced by `engines` |
| pnpm | 9.12.0 | Pinned via `packageManager`; CI uses `--frozen-lockfile` |
| Next.js | 15.5.22 | Both portals |
| React | 18.3.1 | Everywhere, including the PDF renderer |
| Electron | 33.x | Desktop |
| Prisma | 5.x | SQLite provider |
| Postgres | 17 | Supabase; the backup workflow's verify container must match |

`pnpm.overrides` in the root `package.json` pins transitive dependencies that a
parent has not yet picked up — `fast-uri`, `js-yaml`, `builder-util-runtime`,
`postcss`, `sharp`. Each one is there to clear a specific advisory. When bumping
a parent, check whether its override is still needed rather than carrying it
forever.

> Overrides and the lockfile must agree. `pnpm install --frozen-lockfile` fails
> with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` if you change `pnpm.overrides` without
> regenerating `pnpm-lock.yaml` — and that failure takes out the entire CI run at
> step one. Always commit the lockfile alongside a dependency change.
