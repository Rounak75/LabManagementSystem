# Tech stack, and why each piece is here

Three apps and three shared packages in one pnpm + Turborepo monorepo. Every
choice below was made under two constraints that never relaxed: **it has to cost
nothing to run**, and **there is one machine**.

A third constraint shapes almost as much: **the lab's connection is mobile data
on a phone**, and the desktop lives at home rather than at the lab. Anything that
assumes a reliable network, or assumes the two are in the same room, is wrong
here.

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

The direction of travel is worth stating plainly, because most of the sync code
only makes sense once it is: **writes made on the desktop push out through an
outbox; writes made in the cloud are pulled down and applied here.** Where the
same row can be written on both sides, the desktop wins after approval. That rule
is why `Booking` carries a `version` column and why the pullers compare it before
overwriting anything.

---

## The runtime shape

**Electron, not a web app on the lab PC.** The desktop has to print to a Windows
printer with per-printer calibration, hold the master database offline, and run a
scheduled backup while nobody is watching. A browser tab does none of those. It
also has to keep working with the router off, which rules out anything served.

**SQLite via Prisma, not Postgres locally.** One file, no service to install or
keep running, and `VACUUM INTO` gives a consistent backup in one statement. On a
single unattended PC, "no daemon to fail" is a feature: there is nobody to notice
a stopped service, and a lab that cannot open because a database service did not
start is a worse failure than any it would prevent. Prisma earns its place for
the migration history and the generated types more than for the query builder;
where it cannot reach the database at all — `PRAGMA`, `VACUUM INTO`, replaying a
migration file — the code drops to `$queryRaw` (`sqlite-pragmas.ts`,
`backup.service.ts`, `apply-migrations.ts`).

**Supabase, not a hand-rolled API.** The free tier includes Postgres, RLS,
auth-adjacent primitives, Edge Functions and pg_cron. Row-level security in
particular means the access rules live in the database rather than in whichever
route handler remembered to check — which matters when two separate Next apps and
a desktop sync worker all touch the same rows. The alternative, a small server of
our own, would need somewhere to run, something to watch it, and a second set of
access checks written by hand.

**Next.js App Router for both portals.** Server components keep the service-role
key server-side by construction: a component that touches it cannot accidentally
ship to the browser, because it never was browser code. Route handlers give a
place for logic that must not be in the browser. Both are hosted on Vercel, which
is also why they stay small and mostly server-rendered: bandwidth and function
time are the metered resources, and the budget here is whatever costs nothing.

**Two Next apps, not one with role routing.** Patients and staff have different
threat models. A bug in a patient-facing page cannot reach a staff-only route if
staff routes are not in that deployment at all. It costs a second deployment and
some duplicated layout code; the trade is worth it.

---

## The desktop's own libraries

**`@tanstack/react-query` over the IPC bridge.** Every screen reads through
`call(channel, args)`, which is a promise across the Electron bridge — the same
shape as a fetch. React Query gives caching, refetch-on-focus and invalidation
for that without a bespoke store per screen, and it is what lets the Bookings and
Dashboard screens stay current while the sync worker changes rows underneath
them.

**`zustand` for the state React Query should not hold.** Session, toasts, and the
handful of things that outlive a route. Deliberately small: server state belongs
in React Query, and mixing the two is how caches go stale in two places at once.

**`react-router-dom` with `BrowserRouter`.** The renderer is a single window with
many screens; a router is the plainest way to express that, and Electron's
renderer is a real browser context, so the history API works normally.

**`react-hook-form`.** Result entry and patient registration are long forms
filled at speed. Uncontrolled inputs mean typing does not re-render the form on
every keystroke, which is visible on the lab's hardware.

**`ws`, supplying a WebSocket to `supabase-js`.** Electron's main process has no
browser `WebSocket`, and `supabase-js` expects one for realtime. It is passed in
explicitly at `supabase-client.ts` rather than shimmed onto the global.

**`nodemailer`, not an email API.** Booking confirmations, report-ready and
payment notices go out through the lab's own Gmail account over SMTP. A
transactional email service would be another vendor, another key and, past its
free tier, another bill — for a volume measured in a handful of messages a day.

**`electron-vite` → `electron-builder` → `electron-updater`.** Build, package and
self-update. Releases are cut by hand from a developer machine; there is no CI
job that ships the desktop, so **merging a desktop fix does not put it on the lab
PC** — someone has to cut a release. Worth remembering when a fix looks deployed
and the lab still sees the old behaviour. Two commands, and the difference
matters: `package:win` builds the installer locally, `release:win` also uploads
it to GitHub Releases and therefore needs `GH_TOKEN`. Either way the version in
`apps/desktop/package.json` has to be bumped first, because `electron-updater`
only raises its banner for a version higher than the installed one. The full
runbook, including why the installer is unsigned and what the published hash does
and does not protect against, is in `docs/deployment/desktop-release.md`.

**`qrcode.react` and `lucide-react`.** The UPI payment QR, and the icon set. Both
render locally with no network call, which matters for a screen that has to work
offline.

---

## The two web apps

**`jose` for JWTs, not `jsonwebtoken`.** Both portals sign sessions with the same
`SUPABASE_JWT_SECRET` Supabase itself uses, so a token this app mints is
recognised by RLS policies through `auth.jwt()`. `jose` works in the edge runtime;
the Node-only alternative would pin these routes to the Node runtime for no gain.

One consequence is load-bearing and easy to miss: **portal sessions cannot be
revoked.** `verifyPatientJwt` checks signature, issuer and expiry only — there is
no server-side session table to delete from, and Supabase honours the token
directly. The token lifetime *is* the revocation policy. That is why a session
opened with a booking id is capped at 30 minutes and pinned to the password page,
while a real one lasts seven days.

**`bcryptjs`, not `bcrypt`.** The pure-JS implementation has no native build step,
which keeps `pnpm install` working identically on the developer's machine, in CI
and on Vercel. Password hashing is not on any hot path here, so the speed
difference does not buy anything.

**`idb-keyval` for the staff portal's offline queue.** This is the one piece of
the stack that exists purely because of where the work happens. Staff enter
patients and results on their phones, at the lab, on mobile data that drops.
`offline-queue.ts` keeps `patient.create`, `patient.update` and `result.upsert`
in IndexedDB with a 24-hour expiry and replays them when the connection returns,
so a dead spot costs a delay rather than a re-typed patient. `idb-keyval` rather
than a full IndexedDB wrapper because the queue is one key holding one array.

**`next/font/google` for typefaces.** Fonts are self-hosted at build time, so
there is no third-party request on page load — one less thing to be slow on a
patient's phone, and one less party seeing who visits.

**Tailwind 3, not 4.** All three UIs share the same utility vocabulary, which is
most of why a screen can be moved between the desktop and the admin portal
without a rewrite. Still on 3.x deliberately: v4 changes the config format and
the build pipeline, and there is nothing in it this project needs.

---

## The shared packages

**`@lab/types` — Zod at the boundaries.** Anything arriving from the network — a
booking form, a sync payload, a JWT claim set — is parsed, not cast.
`assertStaffClaims` is the clearest example: a valid signature only proves the
token came from this deployment, since the patient portal signs with the same
secret. Zod rather than hand-written guards because the schema is also the
documentation of what a payload may contain.

**`@lab/db` — one schema, one migration history.** The Prisma schema is the
single definition of the local database, and `packages/db/prisma/migrations` is
replayed by `applyPendingMigrations` on the packaged app at startup as well as in
development. The integration tests migrate a throwaway SQLite file the same way,
which is what makes them worth having: they run against real constraints rather
than a mock that accepts anything.

**`@lab/reports` — `@react-pdf/renderer`.** The PDF is what the patient
physically holds and what a doctor reads, so it has to be deterministic and
testable. It is the one place where "it looked fine when I tried it" is not good
enough — the report tests drive the real engine and are mutation-checked. It is a
shared package rather than desktop code because the patient portal serves the
same report for download, and the two must not drift.

---

## Cross-cutting

**TypeScript everywhere, `tsc --noEmit` as the lint step.** There is no ESLint
pass in the desktop; the type checker is the gate. The IPC bridge is where that
pays for itself: `ChannelContract` in `shared/api.ts` pins each channel's input
and output types so the main process and the renderer cannot disagree about a
payload shape without the build failing.

**Vitest as the only test runner**, in all six packages, so one command and one
config style covers the whole repo. Two kinds of test live side by side and the
distinction matters: most desktop tests mock Prisma, which means **they have no
foreign keys and no constraints**. Anything touching cross-table writes gets a
real-SQLite integration test instead — `bookings.integration.test.ts` and
`bookingToReport.e2e.test.ts` are the patterns to copy.

**Turborepo.** Six packages with a real dependency graph; without caching, CI
rebuilds everything on every push and the free Actions minutes go to waste.

**pnpm, with the version pinned in `packageManager`.** Workspace linking without
copying, a content-addressed store that keeps the three apps' shared dependencies
on disk once, and `--frozen-lockfile` in CI so a push cannot quietly resolve a
different tree than the one that was tested.

**The `supabase` CLI at the root**, for cloud migrations and Edge Functions.
Cloud schema changes are files in `supabase/migrations/`, reviewed like any other
code, not clicks in a dashboard — which is the only way `schema-drift.ts` can
meaningfully compare the two sides.

**Dates are formatted by hand, per app.** There is a `format.ts` in each web app
and `shared/lab-date.ts` in the desktop, and none of them call
`Intl.DateTimeFormat`. The lab is in one timezone, its dates are read by people
in that timezone, and whether a given value should be shown in UTC or IST is a
decision per call site — a locale-aware formatter hides that decision rather than
making it. `Intl.NumberFormat` **is** used for rupee amounts, where there is
exactly one right answer. `date-fns` is present but used in a single file; treat
it as legacy rather than the house style.

---

## Things that are deliberately absent

**No ORM in the cloud.** The portals talk to PostgREST through `supabase-js`.
Adding Prisma there would mean a second schema definition to keep in step with
`supabase/migrations/`, and drift between them is exactly the failure that
`schema-drift.ts` exists to catch on the desktop side.

**No state management library in the portals.** Server components plus URL state
cover it. `zustand` is in the desktop, where there is genuine long-lived client
state.

**No component library.** Tailwind plus a handful of hand-written components per
app — `renderer/components/ui/` in the desktop, `components/ui.tsx` in the
patient portal, a flat `components/` in the staff portal. A dependency that owns
the look of every screen is hard to leave, and the surface here is small enough
to own outright.

**No error-tracking SDK yet.** `client_errors` is a table the desktop and portals
write to. Nothing alerts on it — that is a known gap, listed in the audit.

**No test database.** Tests stub Supabase (`src/test/supabase-stub.ts`) and use
real SQLite for anything that touches Prisma. Nothing in CI needs a live cloud,
which keeps the pipeline free and offline-runnable. The cost is real and should
be named: **no test proves Postgres accepts anything.** That is what
`docs/deployment/staging-verification.md` exists for.

**No queue, no Redis, no background worker service.** The outbox is a table and
the worker is a timer inside the Electron main process. One machine, one process,
nothing to deploy.

## Declared but not used

Verified against the source on 2026-08-21. Each is a `package.json` entry with no
import anywhere; safe to drop when the file is next touched.

| Package | Where declared |
|---------|----------------|
| `electron-store` | `apps/desktop` — settings live in `LabSettings` in SQLite instead |
| `jsonwebtoken` | `packages/db` — both apps use `jose` |
| `geist` | `apps/portal` — fonts come from `next/font/google` |

## Versions that matter

| Thing | Version | Note |
|-------|---------|------|
| Node | ≥ 20.10 | Pinned in `.nvmrc`, enforced by `engines` |
| pnpm | 9.12.0 | Pinned via `packageManager`; CI uses `--frozen-lockfile` |
| Next.js | 15.5.22 | Both portals |
| React | 19.2.0 | Everywhere, including the PDF renderer |
| Electron | 33.x | Desktop |
| Prisma | 5.x | SQLite provider |
| Tailwind | 3.4.x | All three UIs; v4 not adopted on purpose |
| Vitest | 2.1.x | All six packages |
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
