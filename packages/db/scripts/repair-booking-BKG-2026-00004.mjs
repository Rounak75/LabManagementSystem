/**
 * One-off repair: move BKG-2026-00004 off the wrong patient record.
 *
 * On 2026-08-21 the booking for Rounak Kumar Mahato (7321902777) was approved on
 * the desktop. The phone already belonged to exactly one patient — Sujata Mahato,
 * LAB-2026-00002 — and the conversion reused that record without asking, because
 * the chooser only appeared when two or more patients shared a number. The
 * booking's name was never compared. The result: no patient record was created
 * for the person who booked, his home collection and its bill were written onto
 * her history, and the booking id signed him into her portal account.
 *
 * The approval logic is fixed (a lone phone match under a different name now
 * raises the chooser, and the unattended sweep skips as `name_mismatch`). This
 * script repairs the row that was already written.
 *
 * ─── Before running ──────────────────────────────────────────────────────────
 *
 *  1. CLOSE THE DESKTOP APP. It holds this database open in WAL mode, and a
 *     write from outside while it runs can corrupt what the app has in flight.
 *  2. Register the patient in the desktop first, on the Patients screen:
 *       name  Rounak Kumar Mahato   phone  7321902777
 *     with his real age and sex. Doing it there rather than here means the
 *     patient id comes from the app's own generator and the record reaches the
 *     cloud by the normal route — and it records his real details instead of the
 *     age 0 / "Other" placeholder a booking conversion writes.
 *  3. Then run this, from the repo root:
 *
 *       node "packages/db/scripts/repair-booking-BKG-2026-00004.mjs"           (dry run)
 *       node "packages/db/scripts/repair-booking-BKG-2026-00004.mjs" --apply   (writes)
 *
 * A dry run changes nothing and prints exactly what --apply would do. --apply
 * copies the database aside first, and refuses outright if anything about the
 * visit has moved on since this was written — a result typed in, money taken,
 * the visit closed. If it refuses, stop and re-read the state rather than
 * loosening the check: those conditions are what make the move safe.
 *
 * ─── What this does NOT do ───────────────────────────────────────────────────
 *
 * The portal account is cloud-only; this database has no copy of it. Clearing
 * the password set on Sujata Mahato's account is a separate step, in Supabase.
 * See the instructions this script prints when it finishes.
 */

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { join, dirname } from "node:path";

// The rows this repair is about, pinned by id. If any of them no longer look the
// way they did when this was written, the script stops rather than guessing.
const BOOKING_CODE = "BKG-2026-00004";
const VISIT_ID = "8f3175a0-9394-4f75-b02d-2be5b57a8134"; // VIS-2026-00017
const WRONG_PATIENT_ID = "3fe20fea-077f-4d31-9748-fa72584f6507"; // Sujata Mahato
const PHONE = "7321902777";
const BOOKED_NAME = "Rounak Kumar Mahato";

const APPLY = process.argv.includes("--apply");
const dbPath =
  process.argv.find((a) => a.endsWith(".sqlite")) ??
  join(
    process.env.APPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Roaming"),
    "@lab",
    "desktop",
    "lab.sqlite",
  );

const iso = (ms) => (ms == null ? null : new Date(Number(ms)).toISOString());
const camel = (snake) => snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Builds a cloud payload in the shape the sync worker already sends for this
 * table — same keys, same order, dates as ISO strings, flags as booleans.
 * Copied from live Outbox rows rather than derived, so a repaired row is
 * indistinguishable from one the app pushed itself.
 */
function payloadFor(row, keys, { dates = [], booleans = [] } = {}) {
  const out = {};
  for (const key of keys) {
    const value = row[camel(key)];
    if (dates.includes(key)) out[key] = iso(value);
    else if (booleans.includes(key)) out[key] = value == null ? null : Boolean(value);
    else out[key] = value ?? null;
  }
  return out;
}

const VISIT_KEYS = [
  "id", "visit_id", "patient_id", "type", "visit_date", "status", "staff_id",
  "report_release_override", "report_release_override_by_user_id",
  "report_release_override_at", "report_release_override_reason",
  "created_at", "updated_at", "deleted_at",
];
const HOME_VISIT_KEYS = [
  "id", "patient_id", "booker_name", "booker_phone", "address", "preferred_date",
  "preferred_time", "tests_requested", "assigned_to_id", "status", "unable_reason",
  "visit_id", "notes", "created_at", "updated_at", "deleted_at",
];
const BOOKING_KEYS = [
  "id", "booking_id", "patient_phone", "patient_name", "patient_email", "address",
  "pincode", "test_ids", "preferred_date", "preferred_slot", "notes", "status",
  "decline_reason", "approved_by_user_id", "approved_at", "assigned_to_user_id",
  "resulting_visit_id", "resulting_patient_id", "version", "source_ip",
  "captcha_passed", "created_at", "updated_at", "phone_confirm_outcome",
  "phone_confirmed_at", "phone_confirmed_by_id",
];

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
  return ok;
};

if (!fs.existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  console.error("Pass the path as an argument if the app stores it elsewhere.");
  process.exit(1);
}

console.log(`Database : ${dbPath}`);
console.log(`Mode     : ${APPLY ? "APPLY — this will write" : "dry run — nothing will be written"}\n`);

const db = new DatabaseSync(dbPath);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => all(sql, ...p)[0] ?? null;

// ─── Read the current state ──────────────────────────────────────────────────

const booking = one(`SELECT * FROM Booking WHERE bookingId = ?`, BOOKING_CODE);
check(booking, `Booking ${BOOKING_CODE} not found.`);
if (booking) {
  check(booking.status === "Approved", `Booking status is ${booking.status}, expected Approved.`);
  check(
    booking.resultingPatientId === WRONG_PATIENT_ID,
    `Booking already points at patient ${booking.resultingPatientId} — not the record this repair is for. It may already have been repaired.`,
  );
  check(
    booking.resultingVisitId === VISIT_ID,
    `Booking points at visit ${booking.resultingVisitId}, expected ${VISIT_ID}.`,
  );
}

const visit = one(`SELECT * FROM Visit WHERE id = ?`, VISIT_ID);
check(visit, `Visit ${VISIT_ID} not found.`);
if (visit) {
  check(visit.patientId === WRONG_PATIENT_ID, `Visit is on patient ${visit.patientId}, not the one this repair moves it off.`);
  check(visit.status === "Open", `Visit status is ${visit.status}. This repair only moves a visit nothing has happened on yet.`);
  check(visit.deletedAt == null, "Visit has been deleted.");
}

// Nothing clinical or financial may have happened on it: moving a visit that
// carries results or money is a different, larger problem than moving an empty one.
const resultCount = one(
  `SELECT COUNT(*) c FROM TestResult r JOIN VisitTest vt ON vt.id = r.visitTestId WHERE vt.visitId = ?`,
  VISIT_ID,
)?.c ?? 0;
check(resultCount === 0, `${resultCount} result(s) already entered on this visit.`);

const lockedCount = one(
  `SELECT COUNT(*) c FROM VisitTest WHERE visitId = ? AND isLocked = 1`, VISIT_ID,
)?.c ?? 0;
check(lockedCount === 0, `${lockedCount} test(s) on this visit are verified and locked.`);

const invoice = one(`SELECT * FROM Invoice WHERE visitId = ?`, VISIT_ID);
if (invoice) {
  check(Number(invoice.amountPaid) === 0, `Invoice has ${invoice.amountPaid} paid against it.`);
  check(invoice.paymentStatus === "Pending", `Invoice payment status is ${invoice.paymentStatus}.`);
  // The invoice itself is the record of money on this machine — there is no
  // separate Payment table locally, and a cloud payment is applied by writing
  // amountPaid here. So those two fields are the whole financial check.
  check(invoice.razorpayOrderId == null, "A Razorpay order was opened against this invoice.");
}

const homeVisit = one(`SELECT * FROM HomeVisit WHERE visitId = ?`, VISIT_ID);
check(homeVisit, "No HomeVisit row found for this visit.");
if (homeVisit) {
  check(homeVisit.status === "Booked", `Home visit status is ${homeVisit.status}; the collection may already have been made.`);
}

// The record to move it onto: the patient registered for the person who booked.
const candidates = all(
  `SELECT id, patientId, name, age, sex, phone FROM Patient WHERE phone = ? AND deletedAt IS NULL`,
  PHONE,
);
const target = candidates.find((p) => p.id !== WRONG_PATIENT_ID && norm(p.name) === norm(BOOKED_NAME));

if (!target) {
  problems.push(
    `No patient record named "${BOOKED_NAME}" on ${PHONE} yet.\n` +
      `      Register one in the desktop first (Patients → New patient), with his real\n` +
      `      age and sex, then run this again. Records currently on that number:\n` +
      candidates.map((p) => `        · ${p.name} (${p.patientId})`).join("\n"),
  );
}

if (problems.length > 0) {
  console.error("Refusing to repair:\n");
  for (const p of problems) console.error("  ✗ " + p);
  console.error("\nNothing was changed.");
  db.close();
  process.exit(1);
}

// ─── Say what will happen ────────────────────────────────────────────────────

const wrong = one(`SELECT patientId, name FROM Patient WHERE id = ?`, WRONG_PATIENT_ID);

console.log("Moving this booking's visit onto the right record:\n");
console.log(`  booking     ${BOOKING_CODE}  (${booking.patientName})`);
console.log(`  visit       ${visit.visitId}  ${new Date(Number(visit.visitDate)).toISOString().slice(0, 10)}  ${homeVisit.preferredTime}`);
console.log(`  invoice     ₹${invoice ? invoice.total : "—"}, unpaid`);
console.log("");
console.log(`  from        ${wrong.name} (${wrong.patientId})   ← wrong: booked by someone else on her phone`);
console.log(`  to          ${target.name} (${target.patientId})   ${target.age}y ${target.sex}`);
console.log("");
console.log("  rows changed: Visit.patientId, HomeVisit.patientId, Booking.resultingPatientId");
console.log("  plus 3 outbox rows so the same change reaches Supabase on the next sync tick.");

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply to make these changes.");
  db.close();
  process.exit(0);
}

// ─── Back up, then write ─────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = join(dirname(dbPath), "backups", `pre-repair-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  const src = dbPath + suffix;
  if (fs.existsSync(src)) fs.copyFileSync(src, join(backupDir, "lab.sqlite" + suffix));
}
console.log(`\nBacked up to ${backupDir}`);

const now = Date.now();
const enqueue = db.prepare(
  `INSERT INTO Outbox (id, tableName, operation, rowId, payload, attempts, nextAttemptAt, status, createdAt)
   VALUES (?, ?, 'update', ?, ?, 0, ?, 'Pending', ?)`,
);

db.exec("BEGIN IMMEDIATE");
try {
  db.prepare(`UPDATE Visit SET patientId = ?, updatedAt = ? WHERE id = ?`).run(target.id, now, VISIT_ID);
  db.prepare(`UPDATE HomeVisit SET patientId = ?, updatedAt = ? WHERE id = ?`).run(target.id, now, homeVisit.id);
  db.prepare(
    `UPDATE Booking SET resultingPatientId = ?, version = version + 1, updatedAt = ? WHERE id = ?`,
  ).run(target.id, now, booking.id);

  // Re-read so the payloads carry exactly what the database now holds.
  const v = one(`SELECT * FROM Visit WHERE id = ?`, VISIT_ID);
  const h = one(`SELECT * FROM HomeVisit WHERE id = ?`, homeVisit.id);
  const b = one(`SELECT * FROM Booking WHERE id = ?`, booking.id);

  const queue = [
    ["visits", VISIT_ID, payloadFor(v, VISIT_KEYS, {
      dates: ["visit_date", "report_release_override_at", "created_at", "updated_at", "deleted_at"],
      booleans: ["report_release_override"],
    })],
    ["home_visits", h.id, payloadFor(h, HOME_VISIT_KEYS, {
      dates: ["preferred_date", "created_at", "updated_at", "deleted_at"],
    })],
    ["bookings", b.id, payloadFor(b, BOOKING_KEYS, {
      dates: ["preferred_date", "approved_at", "created_at", "updated_at", "phone_confirmed_at"],
      booleans: ["captcha_passed"],
    })],
  ];
  for (const [table, rowId, payload] of queue) {
    enqueue.run(randomUUID(), table, rowId, JSON.stringify(payload), now, now);
  }

  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  console.error("\nRepair failed and was rolled back. Nothing changed.");
  console.error(e);
  db.close();
  process.exit(1);
}

console.log("\nDone. Local database repaired, 3 rows queued for Supabase.\n");
console.log("Still to do, by hand:");
console.log("");
console.log("  1. Start the desktop and leave it running for a minute so the outbox drains.");
console.log("     Check the sync dot in the sidebar goes green.");
console.log("");
console.log("  2. In Supabase → SQL editor, clear the password that was set on the wrong");
console.log("     account, so it cannot be signed into with it again:");
console.log("");
console.log("       update patient_accounts");
console.log("          set password_hash = null,");
console.log("              failed_attempts = 0,");
console.log("              locked_until = null,");
console.log("              version = version + 1,");
console.log("              updated_at = now()");
console.log(`        where patient_id = '${WRONG_PATIENT_ID}';`);
console.log("");
console.log("  3. Sign out of the patient portal in the browser that set that password.");
console.log("     Portal sessions cannot be revoked from the server — the cookie IS the");
console.log("     token, it is honoured for 7 days from when it was issued, and clearing");
console.log("     the password above does not end it. Signing out deletes the only copy.");
console.log("");

db.close();
