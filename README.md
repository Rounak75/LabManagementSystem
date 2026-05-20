# Golmuri Janch Ghar — Lab Management System

A Windows desktop app for the lab. It works without internet, prints reports, makes invoices, and keeps everything in one local database file on the PC.

**Lab:** Golmuri Janch Ghar
**Address:** Main Road, Golmuri Chowk, Jamshedpur
**Phone:** 6202924306
**Hours:** 08:00 AM – 01:00 PM and 06:00 PM – 08:00 PM. Sunday evening closed.

---

## Pick your path

This README has two starting points. Pick whichever fits you right now.

- **I just want to use the app today** — jump to [What you'll do every day](#what-youll-do-every-day).
- **I'm setting it up on this computer for the first time** — jump to [Setting up the lab software for the first time](#setting-up-the-lab-software-for-the-first-time).

If a word in this guide is new to you, check the [Glossary](#glossary) at the bottom.

---

## What you'll do every day

You don't need a terminal for this. Just open the **Lab Management** shortcut on the desktop and sign in with your username and password.

A normal day at the lab goes like this:

### 1. Register a new patient

Click **Patients** in the left sidebar, then **+ Register patient**. Fill in name, age, sex, and phone number. The app gives them a patient ID like `LAB-2026-00001`. If the patient has been here before, search for them by phone or name instead — don't register them twice.

### 2. Create a visit

Open the patient's profile and click **+ New visit**. Pick the tests the doctor asked for (CBC, Lipid Profile, Sugar, etc.) and the referring doctor. Save. The visit is now **Open** and waiting for samples.

### 3. Collect samples

When you take blood, urine, or whatever sample is needed, the visit moves forward. You don't have to do anything special in the app for collection — just keep the visit open until results are ready.

### 4. Enter results

Open the visit, click **Enter results** on each test row, and type the values. Abnormal values turn red automatically based on age and sex.

### 5. Verify and lock the test (Admin only)

Once results are correct, an Admin clicks **Verify & lock**. Locked results can't be changed by mistake. When every test in the visit is locked, the visit becomes **Completed**.

### 6. Print the report

Go to **Reports**, find the visit, click **Open**. Preview the PDF and click **Print**. The app uses whatever printer is set as the default in Windows.

### 7. Make the invoice

In the visit, open **Invoice**. Apply a discount if the Admin has approved one. Record the cash payment. Done.

### Forgot something? See it later

- All past patients and visits are searchable from **Patients** and **Reports**.
- Money totals for the day are on the **Dashboard** (Admin only).
- Reports already printed can be reprinted any time — they don't change after they were locked.

---

## Setting up the lab software for the first time

This section is **only** for the very first setup on a new computer. Once it's done, you never run these commands again — you just double-click the desktop shortcut from then on.

It will take roughly **30–45 minutes** the first time, mostly waiting for downloads.

### What you need

- A Windows 10 or Windows 11 PC.
- An **internet connection** during setup (you can unplug after).
- About **500 MB** of free disk space.
- The folder you have right now: `Lab Management System\Lab Management System\`. This is the project folder. Keep it somewhere stable like `C:\Users\<your-name>\Downloads\` or `C:\Lab\`.

### Step 1. Install Node.js

Node.js is the engine the app runs on. You install it once and forget about it.

1. Open your web browser and go to **https://nodejs.org**.
2. Click the big green **LTS** button (LTS means "Long Term Support" — the stable version).
3. Open the file you downloaded. Click **Next** through the installer with default options. When it asks about "automatically install necessary tools," you can leave it unchecked — we don't need them.
4. When the installer finishes, click **Finish**.

**You'll know it's working when:** the installer says "Node.js has been successfully installed."

### Step 2. Open PowerShell

PowerShell is the **terminal** — a black window where you type commands and press **Enter** to run them. We need it for setup.

1. Press the **Windows key** on your keyboard (the one with the Windows logo). The Start menu opens.
2. Type the word **PowerShell**.
3. Press **Enter**.

A dark blue (or black) window opens with a line that ends in `>`. That's the prompt. It's waiting for you to type something.

> **Tip:** When this guide says "run a command," it means: click into the PowerShell window, type the command exactly as shown, and press **Enter**. Capital letters and quotes matter.

### Step 3. Install pnpm

`pnpm` is a tool that downloads the small pieces of software the app is built from. Install it by running this command in PowerShell:

```powershell
npm install -g pnpm@9.12.0
```

You should see something like:

```
added 1 package in 4s
```

**You'll know it's working when:** the prompt comes back (a new line ending in `>`) without an error in red.

### Step 4. Move into the project folder

A "folder path" is the address of a folder on your PC, like a street address for a file. We use the `cd` command (short for "change directory") to move PowerShell into the project folder so the next commands run in the right place.

The path has spaces in it (like `Lab Management System`), so we have to wrap it in **double quotes** `"..."` — otherwise PowerShell thinks each word is a separate thing.

Run:

```powershell
cd "C:\Users\Rouna\Downloads\Lab Management System\Lab Management System"
```

> Replace the path above with wherever your `Lab Management System\Lab Management System\` folder actually lives. The fastest way to get the right path: open File Explorer, navigate to that folder, click in the address bar at the top, and copy what's there.

**You'll know it's working when:** the prompt now starts with that path, like `PS C:\Users\Rouna\Downloads\Lab Management System\Lab Management System>`.

### Step 5. Download the app's pieces

Run:

```powershell
pnpm install
```

This downloads everything the app is built from — Electron (for the window), React (for the screens), Prisma (for the database). The first time, it takes **5 to 15 minutes** depending on your internet. You'll see lots of scrolling text. That's fine.

You should see something like at the end:

```
Done in 8m 12.4s
```

**You'll know it's working when:** the prompt comes back and you see "Done in ...s" near the bottom.

### Step 6. Set up the database

The database is one local file that holds every patient, visit, and result. We create it now and fill it with starter data (the lab's info, common tests like CBC and Lipid Profile, and a default referring doctor).

Run these two commands one after the other:

```powershell
pnpm db:migrate
```

Then:

```powershell
pnpm db:seed
```

You should see something like:

```
Applying migration `20260101_init`
Database created at .../lab.sqlite
Seed complete: 1 doctor, 13 tests, lab settings ready.
```

**You'll know it's working when:** both commands finish with no red error text.

### Step 7. Start the app

Run:

```powershell
pnpm desktop
```

After a few seconds, the **Lab Management** window opens. Leave the PowerShell window open in the background while you use the app — closing PowerShell will close the app too. (When the proper installer is built later, this won't be needed.)

**You'll know it's working when:** the Lab Management window appears with a sign-in or first-run wizard screen.

---

## First boot

The very first time the app opens, you see the **First-run wizard**. Fill it in carefully — some of these things are easy to change later, but the recovery code is **shown only once**.

### 1. Set the Admin account

- **Name:** Your name (or whoever the head of the lab is).
- **Username:** Something short you'll remember, like `admin` or your first name.
- **Password:** At least 8 characters. Mix letters and numbers. Don't use the lab's phone number.

### 2. Save your recovery code

After you set the password, the app shows a **16-character recovery code**, like `K9XF-2A7H-MP4Q-8RT3`.

**This code is your only way back into the app if you ever forget your Admin password.** It is shown **once**. The app does not store it in a way you can read later. If you lose it, the only way to recover the lab is to wipe the database — every patient gone.

You have three ways to save it. Use **at least two**.

- **Copy** — click **Copy to clipboard**, then paste it into a note (Notepad, your phone, an email to yourself).
- **Download** — click **Download as file**. The app saves a file called `lab-recovery-code.txt`. Move this file off the PC.
- **Write it on paper** — the most reliable. Block letters. No mistakes.

**Where to keep it:** somewhere you'll still find it 6 months from now.

- A **locked drawer** at home or in the lab.
- A **password manager** (Bitwarden, 1Password, your phone's built-in one).
- **Not** on the same computer that runs the app. If the PC dies, the code on it dies too.

Once you've confirmed you've saved it, click **I have saved my recovery code**.

### 3. Lab details

Most fields are pre-filled with Golmuri Janch Ghar's information. Confirm:

- Lab name, address, phone, hours.
- Pathologist name, qualifications, registration number (this prints on the report footer).

Click **Finish setup**. The wizard is done forever — you'll see the normal sign-in screen from now on.

---

## Backups

The app makes a copy of your database **every day automatically**. You don't have to do anything for the daily backup to happen — but you should know **where backups live** and **how to copy them off the PC**, in case the computer ever dies.

### What gets backed up

The full database file (`lab.sqlite`) — every patient, visit, result, invoice, and setting. Backups are timestamped, like `lab-2026-05-06-0200.sqlite`.

### When the daily backup runs

By default, **2:00 AM** every night. The PC must be on and the app must be running (or installed as a startup app) for the backup to happen at that time. If the PC was off at 2 AM, the backup runs the next time the app opens.

You can change the time in **Settings → Backups → Schedule**.

### Where backups are saved

The primary location is on the same PC, in a folder Windows calls `%APPDATA%`:

```
%APPDATA%\@lab\desktop\backups\
```

To open this folder:

1. Press **Windows key + R**.
2. Type `%APPDATA%\@lab\desktop\backups` and press **Enter**.

You'll see the list of `.sqlite` backup files, newest at top.

### Set a second backup location (recommended)

A backup on the same computer dies with the computer. Add a **secondary location** — usually a USB drive.

1. Plug a USB drive into the PC.
2. In the app, go to **Settings → Backups → Secondary location**.
3. Click **Browse** and pick the USB drive.

From now on, every daily backup is **also** copied to the USB drive. **Plug the USB in before 2 AM each night** so it's there when the backup runs.

You can also point the secondary location at a synced folder like Google Drive or OneDrive on the PC.

### Back up right now

In **Settings → Backups**, click **Back up now**. A fresh `.sqlite` file is added to the backups folder immediately. Useful before you make any big change (e.g. importing old data, deleting a test from the catalog).

### Restore from a backup

If something went wrong (data deleted, results corrupted), you can roll back:

1. **Settings → Backups → Restore from backup**.
2. Pick from the **last 10 backups** (the app shows date and time).
3. Confirm. The app:
   - Takes a **safety backup** of your current data first (so the restore itself is reversible).
   - Replaces the database with the one you picked.
   - **Restarts itself**.

When the app comes back up, you're working off the restored data. The safety backup is in the same `backups\` folder, named `lab-pre-restore-<timestamp>.sqlite`.

---

## Templates

A **template** controls the **look and feel** of a printed report — the lab logo at the top, font, spacing, the layout of the result table, the disclaimer at the bottom. The numbers (patient name, results, doctor) are always the patient's real data; only the styling comes from the template.

The app ships with a **Default** template. You can create more — for example, one for routine reports and a fancier one for corporate clients.

### Create a template

**Settings → Templates → + New template.**

- Give it a name (e.g. "Routine A4", "Corporate Letterhead").
- Pick the page size (A4 is standard).
- Set the header (logo, lab name, address line, phone).
- Set the footer (pathologist's signature line, disclaimer).
- Save.

### Duplicate a template

Open an existing template and click **Duplicate**. Useful for making a small variation without editing the original.

### Set the default

The default template is what's used unless you pick another at print time. **Settings → Templates → ⋯ → Set as default** on the one you want.

### Switch at print time

When you preview a report, there's a **Template** dropdown at the top of the preview. Pick a different template and the preview updates instantly. Click **Print**.

---

## User management

Only Admins can add, disable, or reset users. **Settings → Users.**

### Add a Staff member or another Admin

Click **+ Add user**. Fill in:

- Full name.
- Username.
- Temporary password (the user will be asked to change it on first sign-in).
- Role — **Staff** (can register patients, create visits, enter results) or **Admin** (everything Staff can do, plus verify/lock results, see money on the Dashboard, manage users, edit catalog and settings).

Save. Tell the new user their username and the temporary password.

### Disable a user when someone leaves

Open the user and click **Disable**. They can no longer sign in, but their history (which results they entered, etc.) stays in the audit log.

You can re-enable a disabled user any time.

### Reset a user's forgotten password

Open the user and click **Reset password**. Pick a new temporary password and tell it to them. They'll be asked to change it on their next sign-in.

### Self-lockout protection

The app **will not let you disable yourself** if you're the only Admin. This protects the lab from being locked out completely. If you need to step down as Admin, first promote someone else to Admin, then disable your account.

The same protection applies to deleting users — you can't delete the last Admin.

---

## Dashboard

The Dashboard is the landing page after sign-in. The numbers reset at midnight every night.

### Today's volume (everyone sees this)

- **Visits** — number of patient visits opened today.
- **Tests** — total tests ordered across those visits.
- **Reports** — completed (locked) reports today.
- **Reports pending** — visits that have results entered but not yet verified and locked.

### Today's money (Admin only)

- **Billed** — total amount on invoices created today (before discount).
- **Collected** — cash actually received today.
- **Discount** — total discount the Admin approved today.

### Backlog (everyone sees this)

- **Tests entered but not locked** — Admin needs to verify these.
- **Open visits** — visits with no results entered yet (waiting for samples or for staff to type results).
- **Outsourced awaiting return** — samples sent to an external lab whose results haven't come back yet (see next section).

Each backlog number is a **link** — click it to see the actual list.

---

## Outsourced tests

Some tests the lab doesn't do in-house — they're sent to a bigger lab in town. The app calls these **outsourced tests**.

### Mark a test as outsourced in the catalog

**Tests → open the test → Outsourced** toggle on. Optionally fill in the partner lab's name. Save.

When that test is added to a future visit, the app knows it's outsourced.

### Track sent samples

When you collect a sample for an outsourced test, open the visit and click **Mark sent** on that test row. Note who you sent it to and the date. The visit shows an **Outsourced — awaiting return** badge.

### Mark received

When the partner lab sends back the result, open the visit, find the outsourced test, click **Mark received**, and type in the result the partner lab gave you. From here it works like any other test — verify and lock to include it on the report.

The Dashboard's **Outsourced awaiting return** number tracks these so nothing falls through the cracks.

---

## Troubleshooting

### "Setup already completed" toast on launch

This means the app already has a user account, so the first-run wizard won't run again. Just sign in with your existing username and password. If you want to start fresh on this PC, see "Forgot Admin password" below.

### Forgot Admin password

1. On the **sign-in screen**, click **Forgot password?**.
2. Enter your **16-character recovery code** (the one you saved during first boot).
3. Set a new password. Sign in.

A new recovery code is generated. **Save it the same way you saved the first one.**

### Lost both password AND recovery code

There's no back door. The only way to use the lab again is to **delete the database file** and start over with a fresh first-run wizard. **All patient data will be lost.**

If you might want to recover the data later (a tech-savvy person can sometimes pull rows out of a `.sqlite` file), **rename** the file instead of deleting it. To do that:

1. Press **Windows key + R**, type `%APPDATA%\@lab\desktop`, press **Enter**.
2. Find the file `lab.sqlite`.
3. Right-click → **Rename** → `lab.sqlite.bak`.
4. Restart the app. The first-run wizard appears.

Better idea: **set a secondary backup location now** (see [Backups](#backups)) so this never happens to a real lab.

### "pnpm is not recognized" or "node is not recognized"

Node.js or pnpm wasn't installed, or PowerShell was opened before the install finished. **Close PowerShell, open it again,** and re-run the command. If that doesn't help, redo Setting up the lab software steps 1 and 3.

### A path with spaces gives an error

Paths like `C:\Lab Management System` have spaces. Always wrap them in **double quotes**:

```powershell
cd "C:\Lab Management System\Lab Management System"
```

Without the quotes PowerShell stops at the first space and gives an error.

### Antivirus blocking the installer

Some antivirus programs (Quick Heal, Norton, McAfee) flag unknown installers. To install the app:

1. **Temporarily disable** the antivirus' real-time protection (right-click its tray icon).
2. Run the installer.
3. **Re-enable** the antivirus.
4. **Add the install folder as an exclusion** so it doesn't quarantine the app later. The exact steps depend on your antivirus — search "add exclusion" in its settings.

### Printer not detected

The app uses **Windows' default printer**. If the print dialog says "no printer":

1. **Settings → Devices → Printers & scanners** in Windows.
2. Add the printer (USB cable, or click **Add printer** for a network one).
3. Right-click it → **Set as default**.
4. Try printing again from the app.

### App opens to a blank white window

Press **Ctrl + Shift + I** to open the developer tools, click the **Console** tab, and read the red text. Most often a database problem — close the app, run `pnpm db:migrate` in PowerShell, and reopen.

### "DUPLICATE_PHONE" when registering a patient

A patient with that phone number is already registered. Cancel the form and **search for the patient** by phone — they'll show up. Open their profile and create a new visit there.

---

## Glossary

- **Terminal** — a window where you type commands instead of clicking buttons. PowerShell is a terminal.
- **Command** — a line of text you type into a terminal and run by pressing **Enter**. Example: `pnpm install`.
- **PowerShell** — the terminal that comes with Windows. We use it only for first-time setup.
- **Folder path** — the address of a folder on your PC, like `C:\Users\Rouna\Downloads`.
- **Press Enter** — push the **Enter** key on the keyboard. Tells the terminal "run what I just typed."
- **`cd`** — short for "change directory." Moves the terminal into a folder.
- **Package** — a small piece of software the app is built from. The app uses hundreds of small packages.
- **Dependency** — a package the app *depends* on to run. `pnpm install` downloads all dependencies.
- **PDF** — the file format for printable reports. Looks the same on every computer and printer.
- **SQLite** — the small database the app uses. The whole database is one file (`lab.sqlite`) on your PC. No server needed.
- **Migration** — a change to the database's structure (adding a new field, etc.). `pnpm db:migrate` applies any pending migrations.
- **Prisma** — the tool the app uses to talk to the SQLite database. You don't interact with it directly.
- **Electron** — the technology that wraps the app in a Windows window. The "Lab Management" window you see is Electron.
- **Recovery code** — the 16-character code shown once at first boot. Lets you reset a forgotten Admin password.
- **Template** — the look and feel of a printed report (logo, fonts, layout). The patient data is real; only the styling is from the template.
- **Backup** — a saved copy of the database file. The app makes one every day at 2 AM.
- **Audit log** — a record of who did what (who locked which test, who edited which patient). Admins can view it in Settings.
- **Outsourced test** — a test the lab sends to an external partner lab instead of doing in-house.

---

## Patient portal (Phase 3d)

Patients can now look up their own reports, pay invoices, and ask for a home sample collection from their phone — no need to call or come to the lab.

**Portal URL:** see **Settings → Lab Info → Patient portal URL** in the desktop app (printed on every receipt from now on).

### How patients log in

Each receipt now prints a **6-character access code** at the bottom (like `K9XF-2A`). Patients open the portal URL on their phone, type their **phone number + access code**, and they're in. The code only works for that one visit; the next receipt has a new code.

If a patient loses the receipt, you can show them the code from the desktop app: open the visit detail page → the access code is shown at the top.

### What patients see

- **Their reports** — view in the browser or download as a PDF.
- **Their invoices** — pay outstanding amounts by UPI (scan the QR code → opens GPay / PhonePe / Paytm with the amount pre-filled).
- **"Already paid?"** button — they click it after paying. You'll see a **yellow dot** next to that invoice on the desktop, meaning "patient says they paid — check your UPI app to confirm and mark received."

### What the lab does daily

Most of the portal is hands-off. The two new things to watch in the desktop app:

- **`/bookings` page** — when a patient asks for a home visit through the portal, the request lands here as a "Pending" booking. Click **Approve & Assign** (pick a phlebotomist) to convert it to a real Patient + Visit + HomeVisit. Or **Decline** with a reason — the patient gets an email.
- **Yellow-dot invoices** — patients who clicked "Already paid?" show a yellow dot. Open the invoice, confirm payment in your UPI app, click **Mark UPI received**.

### Settings that affect the portal

- **Settings → Lab Info → Patient portal URL** — paste the live portal URL once after deploy. This prints on receipts.
- **Settings → Lab Info → Lab UPI VPA + Payee Name** — used for the UPI QR codes patients see. Without these, the pay page can't work.
- **Settings → Closures** — add a holiday/festival date → patients can't book that date on the portal.
- **Settings → Users → "Can collect samples"** — only users with this on appear as phlebotomist options when approving a booking.
- **Tests → edit a test → "Collection time restriction"** — set to "Fasting — morning only" on tests like sugar / lipid panels so the portal only offers patients morning slots when they pick those tests.

---

## For developers / deployers

Operational docs for the portal deploy live at `docs/deployment/portal-vercel-setup.md`:
- Supabase migration order + verification queries
- Vercel environment variable table
- Launch smoke checklist (17 acceptance criteria)
- Open follow-ups (custom domain, Razorpay flip, DLT clear, etc.)

The desktop app needs no special action on deploy day — once **Settings → Cloud sync** is enabled and pointed at the same Supabase project, the existing 10-second outbox worker pushes everything the portal reads.

---

## What's next

**Phases 1, 2, 2.5, 3a, 3b (UPI direct), 3c, and 3d are shipped.** Outstanding items live as TODOs in the project memory, not as a roadmap. The two known external blockers are:

- **Razorpay KYC** — when it clears, paste keys into LabSettings and flip `preferredPaymentGateway` to `"Razorpay"`. UPI direct keeps working in parallel.
- **TRAI DLT for SMS** — when it clears, paste sender ID + template IDs into LabSettings and flip `smsProvider` from `"Off"`/`"Test"` to `"Fast2SMS"`.

Until then, keep doing the daily backups and keep the USB drive plugged in at night.
#   L a b M a n a g e m e n t S y s t e m  
 