# Building and publishing the desktop app

The desktop app is the print station and the master copy of the lab's data. It is
the one piece that is installed rather than visited.

Build on the machine that has the source. The lab PC needs nothing but the
resulting `.exe`.

---

## Build a release

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @lab/desktop package:win
```

`package:win` runs three things in order, and each guards the next:

1. **`pnpm -F @lab/db build:seed-db`** — builds `seed.sqlite` from the migrations
   plus the seed, and **refuses to continue if it contains any patient, visit or
   user rows**. This exists because the installer once shipped the developer's
   own working database, so test patients and dev admin accounts became the
   lab's starting data.
2. **`electron-vite build`** — compiles main, preload and renderer.
3. **`electron-builder --win --x64`** — produces the NSIS installer.
4. **`pnpm release:hash`** — prints the SHA-256 of the installer and writes
   `out/dist/SHA256SUMS.txt`.

Output lands in:

```
apps\desktop\out\dist\Golmuri Janch Ghar Lab Setup <version>.exe
```

**You'll know it worked when** `out\dist\` contains a file ending
`Setup <version>.exe` and the console printed a SHA-256 line.

---

## Publish it

```powershell
pnpm --filter @lab/desktop release:win
```

This does everything `package:win` does and then uploads to GitHub Releases
(`publish.owner` / `publish.repo` in `electron-builder.yml`). It needs a
`GH_TOKEN` environment variable with `repo` scope.

**Paste the SHA-256 into the release notes.** Copy the line
`release:hash` printed, or the contents of `out/dist/SHA256SUMS.txt`:

```
9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08  Golmuri Janch Ghar Lab Setup 0.1.0.exe
```

### Why the hash matters, and what it does not do

The installer is **not code-signed**. Windows shows "Windows protected your PC"
and names the publisher as unknown, and the lab is trained to click through it —
which means an installer someone else sends them looks identical to yours.

A published hash does **not** fix that. Anyone who could swap the installer could
also edit the release notes beside it. What it does catch is the far likelier
failure: a truncated download, a USB stick that corrupted a byte, or simply the
wrong build being carried to the lab. Right now nothing catches those.

The real fix is an OV code-signing certificate (₹15,000–30,000/year). Once
`electron-builder.yml` has one, `electron-updater` verifies each update's
signature and rejects a tampered release rather than merely making it visible.

---

## Install on the lab PC

1. Copy the `.exe` across — USB is fastest; Google Drive works; WhatsApp is
   slow at 80–150 MB.
2. **Verify it first.** In PowerShell on the lab PC:
   ```powershell
   certutil -hashfile "Golmuri Janch Ghar Lab Setup 0.1.0.exe" SHA256
   ```
   Compare against the release notes. If it differs, stop and rebuild — do not
   install it.
3. Double-click. On "Windows protected your PC" → **More info → Run anyway**.
4. Click through the wizard; defaults are fine.

The installer creates the Desktop shortcut and the Start menu entry itself.

**First boot** runs the setup wizard: create the Admin account and **write down
the recovery code**. It is shown once. Without it, a forgotten Admin password
means a database restore.

---

## How updates reach the lab

`autoDownload` is **false**. The app checks GitHub every 6 hours and, when a
newer version exists, shows a banner: *"Version X is available → Download"*.
Nothing is fetched until the owner clicks.

That click is the only path an update takes to the lab PC. Because releases are
unsigned there is no signature for `electron-updater` to check, so a deliberate
human decision stands in for one.

> If a banner names a version you did not publish, **do not click Download**.
> That is the signal that someone else has access to the release account. Treat
> access to that account as equivalent to access to the lab's computer: two-factor
> authentication on, credentials shared with nobody.

---

## Rolling back

1. Delete or mark as pre-release the bad GitHub release.
2. On the lab PC, uninstall via **Settings → Apps**.
3. Install the previous `.exe` (keep the last two releases on the USB stick).
4. The database in `%APPDATA%` is untouched by uninstalling — data survives.

If a release shipped a bad migration, restore the desktop database from a backup
**before** reinstalling. See `backup-and-restore.md`.
