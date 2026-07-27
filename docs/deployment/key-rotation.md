# Rotating a leaked key

Work top to bottom. The order matters: rotating the JWT secret before the portals
have the new value signs every staff and patient out, mid-shift.

Tell the lab first if you are rotating the JWT secret. Everyone will be signed
out and will need to log in again.

---

## Which key leaked?

| Key | What an attacker gets | Urgency |
|-----|----------------------|---------|
| `anon` public key | Nothing beyond what RLS allows — it is published in the browser bundle by design | **None.** This is not a leak. Check RLS instead. |
| `service_role` key | **Everything.** Bypasses RLS entirely — every patient record, read and write | Drop what you are doing |
| `SUPABASE_JWT_SECRET` / `APP_JWT_SECRET` | Can mint a valid Admin token for the staff portal, or any patient's session | Drop what you are doing |
| Desktop's stored service key | Same as `service_role` | Drop what you are doing |
| `BACKUP_PASSPHRASE` | Every nightly backup, if they also have the artifacts | Rotate, then re-run the backup |

> If the **anon key** "leaked", nothing has happened — it is public by design.
> The question to ask instead is whether any table grants `anon` more than it
> should. Run the RLS check in step 5.

---

## Rotating `service_role`

1. **Supabase → Project Settings → API → service_role → Rotate.** The old key
   stops working immediately.
2. **Patient portal (Vercel):** Settings → Environment Variables → update
   `SUPABASE_SERVICE_ROLE_KEY` → **Redeploy**. Environment changes do not take
   effect until a redeploy.
3. **Desktop app:** Settings → Cloud sync → paste the new service key → Save.
   It is re-encrypted with `safeStorage` on write.
4. **Edge Functions:** they read `SUPABASE_SERVICE_ROLE_KEY` from the platform,
   which Supabase updates itself. No action.
5. **GitHub Actions:** `SUPABASE_DB_URL` is a database password, not the service
   key — unaffected unless you rotated that too.

Verify: submit a booking on the portal and confirm the desktop pulls it within
about ten seconds. That exercises both the portal's service key and the
desktop's.

## Rotating the JWT secret

This signs out every staff member and every patient.

1. **Supabase → Project Settings → API → JWT Settings → Rotate.**
2. **Staff portal (Vercel):** update `SUPABASE_JWT_SECRET` → Redeploy.
3. **Patient portal (Vercel):** update `SUPABASE_JWT_SECRET` → Redeploy.
4. **Edge Functions:**
   ```bash
   supabase secrets set APP_JWT_SECRET="<new secret>"
   supabase functions deploy auth-login
   supabase functions deploy change-password
   ```
   Remember the name is `APP_JWT_SECRET` — the `SUPABASE_` prefix is reserved
   and cannot be set as a function secret. The value must match.
5. Sign in on both portals to confirm.

**Symptom of getting this half-done:** sign-in appears to succeed and then
bounces back to `/login`, or every query returns an empty array with no error.
That is a secret mismatch, not a bug.

## Rotating the database password

1. **Supabase → Project Settings → Database → Reset database password.**
2. Update the `SUPABASE_DB_URL` secret in GitHub → Settings → Secrets and
   variables → Actions.
3. **Actions → Cloud backup → Run workflow** to confirm the backup still works.
   Do not wait for tonight to find out.

## Rotating the backup passphrase

Old artifacts stay encrypted under the **old** passphrase — keep it until those
artifacts expire, or you lose the ability to read them.

1. Generate: `openssl rand -base64 32`
2. Update `BACKUP_PASSPHRASE` in GitHub Actions secrets.
3. Run the workflow manually.
4. Keep the old passphrase filed for 90 days, then destroy it.

---

## After any rotation: check what was reachable

A leaked key is worth an hour of checking what it could have touched.

**5. Confirm no table is missing RLS:**

```sql
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

Zero rows expected.

**6. Confirm `anon` cannot read what it should not.** With the anon key from the
browser bundle:

```bash
curl "$SUPABASE_URL/rest/v1/bookings?select=*" -H "apikey: $ANON_KEY"
curl "$SUPABASE_URL/rest/v1/patients?select=*" -H "apikey: $ANON_KEY"
curl "$SUPABASE_URL/rest/v1/users?select=*"    -H "apikey: $ANON_KEY"
```

All three must return `[]`.

**7. Read the audit trail** for the window the key was exposed:

```sql
select "timestamp", action, entity, user_id
from audit_logs
where "timestamp" > '<when it leaked>'
order by "timestamp" desc;
```

**8. If patient data was reachable**, that is a disclosure. Decide — with advice
if you can get it — whether affected patients need telling. Write down what you
found and when, whatever you decide.
