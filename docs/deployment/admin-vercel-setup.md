# Staff portal → Vercel + Supabase

The staff portal (`apps/admin`, package `@lab/admin`) is what staff open on their
phones at the lab. It runs on Vercel and talks to the same Supabase project as
the patient portal and the desktop.

Deploy the **patient portal first** if neither exists yet — it owns the migration
order (see `portal-vercel-setup.md`). Both apps share one Supabase project.

---

## 1. Import the project

Vercel → **Add New → Project** → import the repository.

| Setting | Value |
|---------|-------|
| Framework preset | Next.js |
| Root directory | `apps/admin` |
| Build command | `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @lab/admin build` |
| Output directory | *(leave default — Next.js)* |
| Install command | *(leave blank; the build command installs)* |
| Node version | 20.x (matches `.nvmrc`) |

The root directory is `apps/admin` but the install has to happen at the workspace
root, because `@lab/admin` depends on `@lab/types` via `workspace:*`. Installing
inside `apps/admin` alone will fail to resolve it.

---

## 2. Environment variables

**Settings → Environment Variables.** Set all three for **Production**,
**Preview** and **Development**.

| Variable | Where to find it | Exposed to browser? |
|----------|------------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Yes — safe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public | Yes — safe, RLS gates it |
| `SUPABASE_JWT_SECRET` | Supabase → Project Settings → API → JWT Secret | **No. Server only.** |

`SUPABASE_JWT_SECRET` is what `middleware.ts` and `auth-session.ts` use to verify
the token minted by the `auth-login` Edge Function. If it does not match the
Supabase project exactly, every sign-in appears to succeed and then bounces
straight back to `/login`.

> The staff portal does **not** get `SUPABASE_SERVICE_ROLE_KEY`. It reads through
> the anon key carrying the signed-in user's JWT, so Postgres applies the
> `to authenticated` policies and the column grants from
> `20260727000002_restrict_user_columns.sql`. Giving it the service key would
> bypass all of that.

---

## 3. Edge Functions this app depends on

Deployed once per Supabase project, from the repo root:

```bash
supabase link --project-ref <your-project-ref>
supabase functions deploy auth-login
supabase functions deploy change-password
supabase functions deploy reserve-visit-id
```

Then set their secrets:

```bash
supabase secrets set APP_JWT_SECRET="<the same JWT secret as above>"
```

`APP_JWT_SECRET`, not `SUPABASE_JWT_SECRET` — the `SUPABASE_` prefix is reserved
by the platform and cannot be set as a function secret. It must hold the same
value.

---

## 4. Launch checks

Run these against the deployed URL before handing it to staff.

1. `/login` loads and the lab name renders.
2. Signing in with a **Staff** account reaches `/dashboard`.
3. The money totals on the dashboard are **hidden** for Staff, visible for Admin.
4. Registering a patient produces a `LAB-YYYY-NNNNN` id.
5. Creating a visit, then entering a result, saves without error.
6. **Verify & lock** is refused for Staff (403) and works for Admin.
7. A locked result cannot be edited afterwards.
8. Bookings list loads; approve and decline both work.
9. Sign out, then hit `/dashboard` directly — it must redirect to `/login`.
10. **Sign out everywhere** in Settings invalidates the session on a second device.

If 9 fails, `SUPABASE_JWT_SECRET` is wrong or missing — the middleware is failing
open, which it must never do.

---

## 5. Troubleshooting

**Every page redirects to `/login` even with correct credentials.**
`SUPABASE_JWT_SECRET` does not match the Supabase project. Copy it again — it is
easy to grab the anon key by mistake.

**Queries return empty arrays with no error.**
That is RLS refusing the request, not a bug. Check the JWT actually carries
`role_app` (`Admin` or `Staff`) — `assertStaffClaims` requires it, and
`jwt_role()` in Postgres reads it.

**Build fails on `@lab/types` not found.**
The build command is installing inside `apps/admin` instead of the workspace
root. Re-read step 1.
