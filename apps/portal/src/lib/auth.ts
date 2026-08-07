// Phase 3d Plan C — portal auth service. Two login paths:
//   1) phone + a one-time id (booking id, or the patient id from the report)
//      — spent the moment a password exists
//   2) phone + password (chosen on first sign-in via /account/password)
//
// 5 failed attempts → 15-minute lockout. Failed counts reset on success.
//
// There was a third: phone + a 6-character access code printed on the report.
// It was retired once the patient id took over as the first-time credential —
// the report already carried both, and the code was the weaker half. It stayed
// valid for 180 days against a *full* session with no password step, which made
// it the longest-lived way in and the only one nobody was told about. The
// columns it wrote to are still on Visit; nothing reads or writes them now.

import bcrypt from "bcryptjs";
import { getServiceClient } from "./supabase-server";
import { mintPatientJwt } from "./jwt";

const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 15;

export type PatientSummary = { id: string; name: string; age: number; sex: string };

export type LoginResult =
  | { kind: "no_patient" }
  | { kind: "needs_chooser"; patients: PatientSummary[] }
  | { kind: "invalid_code" }
  | { kind: "locked"; until: string }
  | { kind: "booking_not_ready" }
  | {
      kind: "success";
      jwt: string;
      patientId: string;
      /**
       * True when the patient got in on a one-time credential and has to choose
       * a password before doing anything else. Set by the booking-id path.
       */
      mustSetPassword?: boolean;
    };

async function lookupPatientsByPhone(phone: string): Promise<PatientSummary[]> {
  const sb = getServiceClient();
  const { data } = await sb.from("patients").select("id, name, age, sex").eq("phone", phone);
  return (data ?? []) as PatientSummary[];
}

async function getAccount(patientId: string) {
  const sb = getServiceClient();
  const { data } = await sb
    .from("patient_accounts")
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();
  return data;
}

function lockedUntil(account: { locked_until?: string | null } | null): string | null {
  if (!account?.locked_until) return null;
  return new Date(account.locked_until) > new Date() ? account.locked_until : null;
}

/**
 * Counts a failed attempt.
 *
 * This was a read-modify-write: read `failed_attempts`, add one, write it back.
 * Attempts issued in parallel all read the same value and all wrote the same
 * value, so the counter sat at 1 however many guesses were made and the lockout
 * never engaged against a concurrent attacker — the only kind worth stopping.
 * The increment now happens in one statement inside Postgres.
 */
async function recordFailure(patientId: string): Promise<void> {
  const sb = getServiceClient();
  await sb.rpc("record_failed_patient_login", {
    p_patient_id: patientId,
    p_max_failed: MAX_FAILED,
    p_lockout_minutes: LOCKOUT_MINUTES,
  });
}

async function recordSuccess(patientId: string): Promise<void> {
  const sb = getServiceClient();
  await sb.rpc("record_successful_patient_login", { p_patient_id: patientId });
}

/**
 * Refuses an attempt, counting it against the patient it was aimed at.
 *
 * The two first-time paths below refuse in several places and used to do it with
 * a bare `return { kind: "invalid_code" }`, so the counter never moved and the
 * lockout was unreachable through them however many guesses were made — while
 * their own docstrings claimed otherwise.
 *
 * Takes a possibly-absent id because some refusals happen before any patient has
 * been resolved. There is nothing to count those against, and inventing
 * something would turn the counter itself into a way of asking which ids exist.
 */
async function refuse(patientId: string | null | undefined): Promise<LoginResult> {
  if (patientId) await recordFailure(String(patientId));
  return { kind: "invalid_code" };
}

/** Picks the patient this login is for, or asks when a phone is shared. */
function resolvePatient(
  patients: PatientSummary[],
  patientId?: string,
): { kind: "one"; patient: PatientSummary } | { kind: "choose" } | { kind: "unknown" } {
  if (patientId) {
    const chosen = patients.find((p) => p.id === patientId);
    // A patient id that is not on this phone is not a hint to be helpful about.
    return chosen ? { kind: "one", patient: chosen } : { kind: "unknown" };
  }
  if (patients.length > 1) return { kind: "choose" };
  const only = patients[0];
  return only ? { kind: "one", patient: only } : { kind: "unknown" };
}

export async function tryPasswordLogin(
  phone: string,
  password: string,
  patientId?: string,
): Promise<LoginResult> {
  const patients = await lookupPatientsByPhone(phone);
  if (patients.length === 0) return { kind: "no_patient" };

  // Households share one phone number — the unique constraint on patients.phone
  // was dropped deliberately for that. This path returned the chooser but took no
  // patient id, so anyone sharing a phone could never complete a password login:
  // it always came back asking which patient, forever.
  const resolved = resolvePatient(patients, patientId);
  if (resolved.kind === "choose") return { kind: "needs_chooser", patients };
  if (resolved.kind === "unknown") return { kind: "invalid_code" };
  const patient = resolved.patient;

  const account = await getAccount(patient.id);
  if (!account?.password_hash) return { kind: "invalid_code" };

  const until = lockedUntil(account);
  if (until) return { kind: "locked", until };

  const ok = await bcrypt.compare(password, account.password_hash);
  if (!ok) {
    await recordFailure(patient.id);
    return { kind: "invalid_code" };
  }

  await recordSuccess(patient.id);
  const jwt = await mintPatientJwt(patient.id);
  return { kind: "success", jwt, patientId: patient.id };
}

/**
 * Signs in a patient who booked online, using the booking id and the phone the
 * booking was made on.
 *
 * Why this exists: the other two ways in are a code printed on a receipt and a
 * password set after using that code. A patient who books a home collection has
 * neither — they have not been to the lab, so no receipt exists — and the whole
 * online booking journey therefore dead-ended at the login screen. They could not
 * see the visit they had just booked and paid for.
 *
 * Three deliberate limits, because a booking id is `BKG-YYYY-NNNNN` and anyone
 * can count:
 *
 *  - It is never accepted alone. The phone number on the booking must match, so
 *    this is exactly as strong as phone + access code, the bar already set.
 *  - It stops working the moment a password exists. It is a way to get in the
 *    first time, not a permanent second key; the caller is told to collect a
 *    password immediately.
 *  - The booking must have become a real patient. Until the desktop converts it
 *    there is no record to show, and saying so beats "wrong code", which sends
 *    the patient hunting for a mistake they did not make.
 */
export async function tryBookingIdLogin(phone: string, bookingId: string): Promise<LoginResult> {
  const normalised = bookingId.trim().toUpperCase();
  if (!normalised) return { kind: "invalid_code" };

  const sb = getServiceClient();
  const { data: booking } = await sb
    .from("bookings")
    .select("id, booking_id, patient_phone, status, resulting_patient_id")
    .eq("booking_id", normalised)
    .maybeSingle();

  // One message for every "this is not a way in" case. Distinguishing them would
  // confirm which booking ids exist to someone reading the sequence.
  if (!booking) return { kind: "invalid_code" };
  // The booking id is the half an attacker gets for free — it is printed in the
  // approval email and counts upwards — so the phone number is the half being
  // guessed at, and every guess lands on this same patient. That is precisely
  // the shape the per-account lockout exists to stop, so it has to be counted.
  if (booking.patient_phone !== phone) {
    return await refuse(booking.resulting_patient_id);
  }
  if (booking.status !== "Approved" && booking.status !== "Completed") {
    return { kind: "invalid_code" };
  }

  // Approved, but the desktop has not converted it into a Patient and Visit yet.
  // A real state with its own message — see bookings.service.
  if (!booking.resulting_patient_id) return { kind: "booking_not_ready" };

  const patientId = String(booking.resulting_patient_id);
  const account = await getAccount(patientId);

  const until = lockedUntil(account);
  if (until) return { kind: "locked", until };

  // Spent. From here on the password is the way in.
  if (account?.password_hash) return await refuse(patientId);

  await recordSuccess(patientId);
  const jwt = await mintPatientJwt(patientId, { mustSetPassword: true });
  return { kind: "success", jwt, patientId, mustSetPassword: true };
}

/**
 * Signs a walk-in patient in with the patient id they were given at the counter.
 *
 * The lab does not print receipts — that is a per-visit cost it will not carry —
 * so the access code reaches the patient only on the finished report, printed at
 * the very end of the visit. Until that moment they had no way into the portal
 * at all: they could not watch their report's progress and could not pay to
 * release it, which is most of what the portal is for. The patient id is the one
 * credential staff can hand over out loud at registration, and it is on the
 * report afterwards, so it works before and after.
 *
 * Same three limits as the booking id, for the same reason — `LAB-YYYY-NNNNN` is
 * a sequence anyone can count through:
 *
 *  - Never accepted without the phone number on the record.
 *  - Spent the moment a password exists; the caller sends them to choose one.
 *  - Failures count towards the same lockout as every other path.
 */
export async function tryPatientIdLogin(phone: string, patientId: string): Promise<LoginResult> {
  const normalised = patientId.trim().toUpperCase();
  if (!normalised) return { kind: "invalid_code" };

  const sb = getServiceClient();
  const { data: patient } = await sb
    .from("patients")
    .select("id, patient_id, phone, deleted_at")
    .eq("patient_id", normalised)
    .maybeSingle();

  // One message for every refusal. Distinguishing them would confirm which
  // patient ids exist to someone reading the sequence.
  if (!patient) return { kind: "invalid_code" };
  // A removed record has no live account to count against, and this is not a
  // guessing vector — the id names a patient the lab has already erased.
  if (patient.deleted_at) return { kind: "invalid_code" };
  // `LAB-2026-00042` is on every report this patient has ever been handed, so it
  // is the half an attacker already has; the phone number is the half they must
  // guess, and every guess resolves this same patient. Counted for that reason.
  if (patient.phone !== phone) return await refuse(patient.id);

  const id = String(patient.id);
  const account = await getAccount(id);

  const until = lockedUntil(account);
  if (until) return { kind: "locked", until };

  if (account?.password_hash) return await refuse(id);

  await recordSuccess(id);
  const jwt = await mintPatientJwt(id, { mustSetPassword: true });
  return { kind: "success", jwt, patientId: id, mustSetPassword: true };
}

export async function trySetPassword(patientId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new Error("PASSWORD_TOO_SHORT");
  const sb = getServiceClient();
  const account = await getAccount(patientId);
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");
  const hash = await bcrypt.hash(newPassword, 10);
  await sb
    .from("patient_accounts")
    .update({
      password_hash: hash,
      version: (account.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);
}
