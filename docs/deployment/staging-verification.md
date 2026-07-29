# Staging verification — one patient, end to end

Run this once on a **staging Supabase project** before any of it touches real
patients. It walks a single patient through the whole lab day and exercises the
four database functions added in this round of work.

**Why this runbook exists.** Those four functions have never executed. The test
suite stubs Supabase entirely, so it proves the application code calls them
correctly and proves nothing about whether Postgres accepts them. Reading the SQL
against the migration history already caught two faults that typecheck and 860
passing tests did not — re-verifying a visit would have failed against its own
trigger, and a repeated test id would have billed the patient twice. Those were
found by reading. This is the pass that runs them.

Budget about 40 minutes. Do it in one sitting: several steps depend on state left
by the one before.

---

## 0. Set up staging

Do **not** point this at the live project. Create a separate one.

1. Supabase → **New project**, region `ap-south-1`.
2. Apply every migration, in filename order:

   ```bash
   supabase link --project-ref <staging-project-ref>
   supabase db push
   ```

3. Confirm the four new functions exist. In Supabase → **SQL Editor**:

   ```sql
   select proname from pg_proc
    where proname in ('create_visit_with_invoice','verify_visits',
                      'next_booking_id','record_invoice_payment')
    order by proname;
   ```

   **Expect four rows.** Fewer means `db push` did not reach the new migrations —
   stop and fix that before going on, because every step below depends on them.

4. Point a local admin + portal at staging (`.env.local`), and run the desktop
   against the same project with **Settings → Cloud sync** enabled.
5. Seed the catalogue if the project is empty — you need at least two priced
   tests and one user of each role.

> **Turn notifications on for this run.** `notificationsEnabled` and
> `emailEnabled` both default to `false`, and steps 6 and 9 check things that
> only happen when they are on. Settings → Notifications, plus the Gmail App
> Password for email.

---

## 1. Register a patient — staff portal

Staff portal → **Patients → Register patient**. Name, 10-digit phone, age, sex.

- **Expect:** a patient id like `LAB-2026-00001`.
- **Watch for:** `id_alloc_failed`. That means the `reserve-visit-id` Edge
  Function is not deployed to staging. Deploy it before continuing.

## 2. Create a visit and take a part payment

Open the patient → **+ New visit**. Pick **two** tests with different prices.
Note the total the picker shows.

In **Paid now**, enter roughly half the total, leave the method on **Cash**, and
create the visit.

- **Expect:** the visit page opens, and the billing panel reads
  `Billed <total> · Paid <half> · Balance <half>`.
- **This is the main event.** Before this work there was no invoice at all for a
  visit created here. If the balance line is missing or the numbers are wrong,
  `create_visit_with_invoice` is not behaving and nothing downstream will be
  right.

### 2a. Prove the server prices the visit, not the browser

Worth doing once, because it is the check that stops a tampered request billing
the wrong amount:

```bash
curl -X POST '<admin-url>/api/visits/create' \
  -H 'Content-Type: application/json' \
  -b 'admin_session=<your session cookie>' \
  -d '{"patientId":"<uuid>","visitDate":"2026-07-29","testIds":["<id>","<id>"],
       "allocatedVisitId":"VIS-2026-09999","amountPaid":999999}'
```

- **Expect `400`**, with `payment exceeds the visit total`.
- **A `200` here is a real problem** — it means the payment ceiling is not being
  enforced and the invoice can be created already over-paid.

## 3. Check it reached the home PC

Wait ~15 seconds, then open the desktop app → the patient's visit.

- **Expect:** the visit is there, **with its invoice**, showing the same balance.
- **Watch for:** a visit with no invoice. That means `pull-visits` is not
  materialising it — the case where the lab PC knew about the patient but had no
  bill for them.
- **Also expect** the paid half to be present. It arrives on the payments stream
  a moment after the visit, so give it a second tick before judging.

## 4. Enter results — staff portal

Staff portal → the visit → **Enter results**. Fill in every parameter of both
tests, then **Done — send to verify**.

- **Expect:** the visit moves to **Awaiting verify**.
- **Then check the desktop Dashboard.** "Tests entered but not locked" should now
  count these tests. It used to read zero for anything typed on a phone, which is
  the number that tells the owner there is work waiting.

## 5. Verify — staff portal

As an **Admin**, open the visit → **Review & verify** → verify it.

- **Expect:** the visit becomes **Completed**, not `Verified`. `Verified` is the
  old value nothing reads; seeing it means the route is not calling
  `verify_visits`.
- **Then click verify a second time.** It must succeed or do nothing quietly. An
  error mentioning *editing signed-off results* means the ordering fix inside
  `verify_visits` is not in place — this is the fault found by reading, and this
  click is how you confirm it is actually gone.

## 6. Check the report is withheld — patient portal

Log in as the patient (phone + the access code on the receipt).

- **Expect:** "Your report is ready", the outstanding balance, and a **Pay**
  button. **Not** a download link.
- **Confirm the server agrees**, not just the page:

  ```bash
  curl -i '<portal-url>/api/reports/<visit-uuid>' -b 'portal_session=<cookie>'
  ```

  **Expect `402`** with the balance in the body. A `200` here means the gate is
  only in the UI and anyone with the link can take the PDF unpaid.

## 7. Print from the phone

Staff portal → the visit → **Print**.

- **Expect:** within ~15 seconds the report prints on the machine running the
  desktop app, with no dialog appearing.
- **Watch for:** it saying "Queued for printing" and nothing happening. That was
  the old behaviour — the job sat at `Picked` forever while the UI claimed
  success. Check the desktop is running; the queue only drains there.
- **Also confirm** printing works while the bill is unpaid. The payment gate is
  deliberately portal-only; printing must never be blocked.

## 8. Take the balance

Staff portal → **Payments** → the invoice → record the remaining amount.

- **Expect:** the invoice goes to **Paid** and leaves the outstanding list.
- **If the patient tapped "Already paid?"** first, check **Payments → Open
  claims**: that claim should now be closed. It used to stay open, so the same
  payment had to be dealt with twice.

## 9. Confirm the report unlocks

Back on the patient portal, reload.

- **Expect:** the **Download PDF** button, and a PDF that opens with both tests,
  the values you entered, and the pathologist's name in the footer.
- **Expect the report email** to arrive (this is the one held back at step 6
  waiting for payment, released when step 8 recorded the money — it is why
  notifications had to be on for this run).

## 10. The override

Create a second visit for the same patient, leave it unpaid, enter and verify
results.

- On the desktop visit screen, **expect** "The patient cannot download this
  report until ₹X is paid", with **Release report anyway**.
- Click it. On the patient portal, **expect** the download to work while the
  balance is still owed.
- Click **Withhold report again** and confirm it locks back.
- **Check both screens.** The same button is on the staff portal visit page and
  must agree — the flag travels between them on sync.

## 11. Home visit booking

Patient portal → **Book a home collection**. Fill it in and submit.

- **Expect:** a booking id like `BKG-2026-00001`.
- Staff portal → **Bookings** → **Approve & Assign**, pick a phlebotomist.
- **Expect, within ~15 seconds on the desktop:** a real Patient, Visit,
  **Invoice** and HomeVisit for that booking. Approving on a phone used to
  produce none of these — it only marked the booking approved.
- **Expect the patient to be emailed** that it was approved.
- **Decline a second booking** and confirm that email arrives too.

> If the phone number matches **more than one** existing patient, the conversion
> deliberately stops and waits for a human. Approve that one from the desktop,
> where the chooser asks which household member it belongs to. That is correct
> behaviour, not a failure.

---

## What to do with failures

Note which step, and what the screen or `curl` actually said.

Steps **2, 5, 6 and 11** are the ones that exercise the new SQL. A failure there
is most likely in the function itself and is the reason this runbook exists.
Steps **3, 4, 7, 8 and 9** are sync and worker paths; a failure there is more
often a stopped desktop app or cloud sync switched off, so check those first.

For a sync step that silently does nothing, look at **Settings → Cloud sync** on
the desktop for a quarantined row: a row that fails repeatedly is held in
`SyncDeadLetter` with its reason rather than being dropped.

---

## Only after this passes

1. Apply the migrations to the **live** project — `supabase db push` — **before**
   deploying admin and portal. The apps call functions that must already exist.
2. `pnpm db:migrate` on the lab PC for the local `Visit` columns.
3. Deploy admin + portal, then rebuild the desktop installer with
   `pnpm --filter @lab/desktop package:win`.
4. Turn notifications on in the live settings, and fill in the UPI VPA and payee
   name — without those the pay page cannot render a QR, and UPI is the only
   live payment route.
