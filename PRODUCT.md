# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One product, three surfaces, three genuinely different people. Design decisions that treat them as one audience will be wrong for at least two of them.

- **The owner** — runs the lab and signs the reports. Uses the **desktop app** on the home PC (Windows), mostly outside lab hours. Verifies and locks results, prints reports, handles invoices and backups. Non-technical. Sole Admin in practice.
- **Lab staff** — phlebotomists and receptionists. Use the **staff portal** (`apps/admin`) in a phone browser, standing at the lab counter during the 08:00–13:00 and 18:00–20:00 shifts, usually with a patient in front of them. They register patients, create visits, and type results as they go.
- **Patients** — use the **patient portal** (`apps/portal`) on their own phones. Look up a report, pay an invoice by UPI, request a home visit. Many arrive here having been told a patient ID out loud at the counter.

## Product Purpose

Run the whole lab without paper: register patients, record test results, print reports, raise invoices, get reports to patients, and take home-visit bookings.

Success is measured by an absence: the owner never re-types anything a staff member already entered.

## Positioning

**Type once at the lab, print at home.**

The lab has no computer. Before this system, staff handwrote every patient and every result into a paper notebook at the lab, and the owner re-typed all of it into the home PC that evening. Every patient was entered twice, and every re-typing was a chance to introduce an error into a medical record.

The system removes the second entry rather than speeding it up. Staff type directly into the staff portal on their own phones at the counter; the data reaches the home PC over the internet within seconds; the owner verifies and prints.

The architectural commitment that makes this honest: **the desktop app is the offline master and the source of truth.** The cloud is a sync channel, not the record. A neighboring product built cloud-first could not truthfully make the same claim, because the lab's data would then depend on the lab's internet.

## Operating Context

- **The lab:** Golmuri Janch Ghar, Main Road, Golmuri Chowk, Jamshedpur. Phone 6202924306. Open 08:00–13:00 and 18:00–20:00; Sunday evening closed.
- **The lab has no PC.** The only computer is the owner's home PC. Everything that happens at the lab happens on a staff member's own phone, over mobile data or the lab's wi-fi.
- **The daily loop:** register patient → create visit → collect samples → enter results → Admin verifies & locks → print report → invoice.
- **Sync is adaptive, not fixed:** every 5 seconds while there is work, backing off to 60 seconds when idle and 5 minutes when the cloud is unreachable. Any new write resets it to 5 seconds. "How long until it appears" therefore has no single answer.
- **Staleness is a real state, not an edge case.** When the desktop stops syncing, the staff and patient portals are both showing an old picture. The staff portal already carries a banner for this.
- **The desktop is Windows-only and the installer is unsigned**, so first install shows a SmartScreen warning and updates are download-on-click only, never silent.
- **Backups** run nightly at 02:00 to `%APPDATA%`, are verified by re-opening and integrity-checking each copy, and a failed copy does not advance the "last backed up" date.
- **Both web apps answer `/api/health`** for an external uptime monitor, and they answer different questions. The patient portal's makes a real query against `cloud_heartbeat` — that is what keeps the free Supabase project from pausing after seven idle days, so it must never become a static 200. The staff portal's reports whether it is configured and whether the database host answers; it deliberately holds no service-role key, because every database call there travels on a staff member's own JWT so RLS applies.
- **Fixed domain vocabulary** (see `CONTEXT.md`, which is authoritative): Visit, Booking, Test, Test Catalogue, Slot; and the modules VisitOrchestrator, SyncEngine, BookingState. Interface copy should use these words in this sense.

## Capabilities and Constraints

- **Roles:** Staff and Admin. Admin-only: verify & lock results, money figures on the dashboard, user management, test catalogue, settings, and dissociating a patient's phone number.
- **Locked results are immutable.** Once every test in a visit is locked, the visit completes and the report does not change afterward. Reprints are identical.
- **Patient sign-in has three routes:** first-time (phone + a `LAB-…` patient ID or `BKG-…` booking ID, which forces a password to be set before anything is shown), password thereafter, and a 6-character access code printed on a report that is valid for that one visit.
- **Shared phone numbers are normal** — several family members on one number, so the portal asks which patient after the number checks out. This is not an error state.
- **Outsourced tests** are sent to a partner lab and tracked with "Mark sent" / "Mark received."
- **Payments today are UPI direct:** QR code → patient taps "Already paid?" → a yellow dot appears on the desktop invoice → the owner confirms in their UPI app and marks it received. Razorpay is built but switched off pending KYC. SMS is off pending TRAI DLT clearance; email and the printed access code do not depend on it.
- **Language: English throughout**, on all three surfaces and on printed reports. Confirmed — there is no i18n requirement today.
- **Explicitly pending, and not code:** Razorpay KYC, TRAI DLT registration, and the lab secrets (UPI VPA, payee name, Gmail app password) that Settings needs before those features work.

## Brand Commitments

**Binding — preserve, do not reinvent:**

- The name **Golmuri Janch Ghar**.
- The lab's identity details — address, phone, opening hours, and the pathologist's name, qualifications, and registration number. These are real facts, not placeholders, and reports read them from **Settings → Lab Info** at print time rather than hard-coding them.
- The lab logo at `apps/desktop/src/renderer/assets/logo.png`. Use it as-is.
  **Note the file is misnamed:** it is a 1024×1024 **JPEG** (`ffd8ff…JFIF`), not a
  PNG. Browsers sniff content so it has always rendered, but it means the logo has
  **no transparency** and carries its own background — so it cannot sit on the dark
  rail or the teal band without showing a box, and it is not safe to declare as a
  `maskable` app icon. It is copied to `apps/{admin,portal}/public/icon.jpg` with a
  truthful extension. A transparent PNG or an SVG master would fix all three limits
  at once and is worth requesting from whoever produced the original.

**Explicitly not binding:**

- The **printed report layout is open to redesign.** The owner has confirmed design work may change it. (This is the one place where the "medical output is settled" instinct does not apply — check here before assuming.)

**Gap:** the staff portal and patient portal currently ship no logo or brand asset of any kind. Patients meet the lab through an unbranded page.

## Evidence on Hand

- This is a **live system for a real lab**, past its first real run with real patients and real reports. It is not a demo or a portfolio piece.
- `apps/desktop/src/renderer/assets/logo.png` — the real logo. App icons in `apps/desktop/build/`. These are the only brand images in the repository.
- `docs/research/jamshedpur-lab-test-pricing.md` — real local pricing research.
- Seed data: 13 tests, one referring doctor, and the lab's settings.
- Deployment runbooks under `docs/deployment/` describe the real, in-use release and backup procedures.

**Absences future work must not fabricate:** there are no testimonials, no customer logos, no press coverage, no benchmarks, no case studies, and no pricing or plan tiers. The product is one lab's internal system and is not sold to anyone. Nothing may invent social proof for it.

## Product Principles

1. **Never make anyone type the same thing twice.** This is the reason the system exists; any design that reintroduces re-entry has failed regardless of how it looks.
2. **The desktop is the truth; the cloud is a channel.** Any surface can be showing a stale picture, and staleness must be visible rather than silent.
3. **High cognitive load is the normal condition, not the exception.** Staff are standing, one-handed on a phone, with a patient waiting. Interfaces earn their keep by being scannable, not by being expressive.
4. **A locked result is a record.** Immutability, the audit log, and "who did what" are product features, not compliance decoration.
5. **The owner is non-technical and operating alone.** No routine step may require a terminal, a command, or a developer.

## Accessibility & Inclusion

**Standard: WCAG 2.2 Level AA.** Confirmed 2026-08-18. This is the target for all three surfaces and is the reference future work is measured against, replacing the earlier undecided state.

Context that shapes how it applies here:

- **English throughout**, confirmed. No translation requirement at present.
- The **staff surface is phone-first and one-handed**, used standing at a counter under time pressure. Touch targets and reach matter more than density here.
- Patients arrive on **their own phones**, and the range of devices is not controlled by the lab. The portal has to survive a low-end Android browser.
- The **printed report is not a web surface** and WCAG does not govern it, but the same principle does: it prints in black and white, so no information may be carried by colour alone. See the Ink-First Rule in `packages/reports/DESIGN.md`.

Already implemented and not to be regressed:

- Visible focus indication on every interactive element — defined once globally in each web app rather than per component.
- Minimum 44 × 44px touch targets on the patient portal, including for controls the design draws smaller (`.hit`).
- Form fields at ≥16px, which also prevents iOS Safari's zoom-on-focus trap.
- Full `prefers-reduced-motion` handling in the portal: fades that aid comprehension are kept, travel is dropped.
- Abnormal results marked by letter as well as colour, on screen and on paper.

Known gaps to close against the standard.

**Corrected 2026-08-18 against measured values.** The three entries previously
listed here were largely wrong: two named desktop problems that had already been
fixed, and the contrast entry pointed at the wrong app. Ratios below are computed,
not estimated.

Closed, and not to be re-opened by a future pass:

- **Desktop toast severities pass.** info 14.63:1, success 5.48:1, warn 6.97:1,
  error 4.70:1. The earlier suspicion that they paired white on mid-saturation
  fills was incorrect; `Toast.tsx` already tints the warn ink from the surface hue.
- **The desktop `Modal` does trap focus.** It cycles Tab and Shift+Tab, focuses
  the first control on open, restores focus to the opener on close, and sets
  `aria-modal`. It is the best dialog implementation in the repo.
- **The staff portal's six dialogs** (Approve, Decline, BatchVerify, MarkPaid,
  EditValue, SendBack) had none of that and now share
  `apps/admin/src/components/Dialog.tsx`, which reuses the desktop's behaviour.
- **The staff portal's global focus ring was dead on every field** — `.input`
  carried `focus:outline-none`, which as a utility outranked the `:focus-visible`
  rule in the base layer. Removed there and at the two inline uses.
- **The desktop app had no global focus rule at all**, despite this document
  claiming one existed in each app. It now defines one in
  `src/renderer/styles/tailwind.css`, at 5.70:1 on white.
- **"Send back" was white on `amber-500` at 2.15:1**, a 1.4.3 failure on a
  workflow-critical control. Now `amber-700` at 5.02:1.
- **`text-slate-400` on white is 2.56:1** and was carrying real content across
  twelve places in the staff portal. Raised to `slate-600`. It remains in use for
  decorative icons and on the dark rail, where it is not measured against white.

Also closed in the same pass:

- **Live regions.** The result-save status, and both the offline and sync-health
  banners, now announce. The banners are always mounted with only their contents
  conditional — a region that mounts together with its message is frequently
  missed by screen readers.
- **`prefers-reduced-motion` in the staff portal**, following the patient portal's
  principle: press travel and the rail slide stop, the route spinner keeps
  spinning because it is a progress indicator rather than decoration.
- **Both web apps have an icon, a manifest and a `theme-color`.** Staff can add
  the staff portal to a phone home screen and it opens without browser chrome.
- **Status badges.** `InProgress` and `PendingVerify` were the same amber tint and
  are the two that appear side by side in the visits list. `PendingVerify` is now
  the only filled chip in the app. `Cancelled` was 4.34:1 and is now compliant.
- **Raw server errors no longer reach the counter.** `lib/api-error-message.ts`
  translates a failed response; anything unrecognised becomes status-based copy
  and the original goes to the console. Previously the forms rendered whatever the
  route returned, including raw Postgres constraint violations and Zod objects.

Still open:

- No keyboard-only or screen-reader pass has been run on any surface. Every fix
  above was reasoned from source, not observed in a screen reader.
- Contrast on the **patient portal** has not been audited to the same standard,
  though its `globals.css` documents several deliberate corrections already.
- The **desktop app** has had no design review at this depth; only its focus
  handling and toast/badge contrast were examined.
