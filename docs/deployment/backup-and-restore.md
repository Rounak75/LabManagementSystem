# Backup and restore

There are two independent copies of the lab's data, and they fail in different
ways. Know which one you are restoring before you start.

| Copy | What it holds | Where | Who writes it |
|------|---------------|-------|---------------|
| **Desktop SQLite** | Everything. This is the master. | `%APPDATA%/Golmuri Janch Ghar Lab/lab.sqlite` on the home PC | The desktop app |
| **Supabase Postgres** | The synced subset — patients, visits, results, invoices, payments, bookings | Supabase cloud | Desktop sync worker + the two portals |

The desktop is the master. The cloud is a read surface plus an inbox. If the two
ever disagree, the desktop is right.

---

## The nightly cloud backup

`.github/workflows/backup-cloud.yml` runs at 02:40 UTC (08:10 IST) every day. It
dumps Postgres, **restores that dump into a throwaway Postgres to prove it
works**, encrypts it, and uploads it as a workflow artifact kept for 90 days.

The restore rehearsal is the point. A dump nobody has replayed is a belief, not a
backup — and the free Supabase plan gives you no backups at all, so this is the
only cloud copy that exists.

### One-time setup

In GitHub → **Settings → Secrets and variables → Actions**, add:

| Secret | Where to get it | Notes |
|--------|-----------------|-------|
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → **URI** | Must be the **direct** connection on port **5432**. The 6543 transaction pooler cannot hold the consistent snapshot `pg_dump` needs and will produce a subtly broken dump. |
| `BACKUP_PASSPHRASE` | Generate one: `openssl rand -base64 32` | **Store this outside this repository and off the lab PC.** Losing it makes every backup unreadable. A password manager or a piece of paper in a different building both work. |

Then run it once by hand: **Actions → Cloud backup → Run workflow**. Confirm it
goes green before trusting the schedule.

### What "it failed" looks like

GitHub emails the repository owner on a failed scheduled workflow. That email is
the alert — it means either the database is unreachable or the dump no longer
restores. Both are worth interrupting your day for.

The workflow deliberately fails rather than warns when:

- the dump is under 10 KB, or contains no `CREATE TABLE` — a dump that failed
  authentication still exits 0 and leaves a short, valid-looking file
- fewer than 10 tables restore
- `psql` hits any error during the replay (`ON_ERROR_STOP=1`)

### Restoring the cloud from a backup

1. **Actions → Cloud backup**, open a run, download the artifact from the
   **Artifacts** section. You get `backup-YYYYMMDD.sql.gpg`.
2. Decrypt it:
   ```bash
   gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" \
       --output backup.sql backup-20260727.sql.gpg
   ```
3. Restore into the target project:
   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f backup.sql
   ```
4. Re-apply anything newer than the dump from the desktop by turning cloud sync
   off and on in **Settings → Cloud sync** — the outbox will re-push.

> Restoring over a live database replaces rows. If you are not certain, restore
> into a **new** Supabase project first and compare.

---

## The desktop backup

The desktop backs itself up on the schedule in **Settings → Backup** (default
02:00 local). Each backup is verified by reopening it, running
`PRAGMA integrity_check`, and counting a real table — a copy that cannot be read
back is logged `failed` and does **not** advance "last backup", so the app keeps
telling you a backup is due.

Two copies are written:

- **Primary** — `%APPDATA%/Golmuri Janch Ghar Lab/backups/`. Same disk as the
  live database, so it survives an accidental deletion but not a dead drive.
- **Off-machine** — whatever path is set in Settings → Backup. This is the one
  that survives the PC dying. **Plug the USB stick in.** If the path is missing
  the run is logged `partial`, not `success`.

### Restoring the desktop

1. **Settings → Backup**, find the backup in the list, click **Restore**.
2. The app takes a `pre-restore` safety backup first, then swaps the file in.
3. Sign in and spot-check today's visits before doing anything else.

If the app will not start at all, restore by hand: close the app, copy the
`.sqlite` backup over `%APPDATA%/Golmuri Janch Ghar Lab/lab.sqlite`, start it.

---

## What is still not covered

**Desktop backups are unencrypted.** They contain every patient record in plain
SQLite. Anyone who takes the USB stick has the lab's entire history. Treat that
stick like the lab's paper register — because that is exactly what it is.

**The 90-day artifact window.** Cloud backups older than 90 days are deleted by
GitHub. Once a quarter, download the newest artifact and copy it to the owner's
own Google Drive so there is a copy that does not expire.
