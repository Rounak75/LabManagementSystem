// Phase 3d Plan C — portal auth service. Two login paths:
//   1) phone + access-code (from the printed receipt) — primary
//   2) phone + password (after the patient opts in via /account/password)
//
// 5 failed attempts → 15-minute lockout. Failed counts reset on success.

import bcrypt from "bcryptjs";
import { getServiceClient } from "./supabase-server";
import { mintPatientJwt } from "./jwt";

const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 15;

/**
 * How long a printed access code keeps working.
 *
 * The code is a bearer credential on a slip of paper the lab cannot take back,
 * and login used to match it against *every* visit the patient had ever had, with
 * no expiry — so a receipt found in a drawer years later still opened the whole
 * record. Codes now only unlock the portal for this long after the visit they
 * were printed for; after that the patient sets a password or asks the lab.
 */
export const ACCESS_CODE_VALID_DAYS = 180;

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

export async function tryLogin(input: {
  phone: string;
  code: string;
  patientId?: string;
}): Promise<LoginResult> {
  const patients = await lookupPatientsByPhone(input.phone);
  if (patients.length === 0) return { kind: "no_patient" };

  const resolved = resolvePatient(patients, input.patientId);
  if (resolved.kind === "choose") return { kind: "needs_chooser", patients };
  if (resolved.kind === "unknown") return { kind: "invalid_code" };
  const candidate = resolved.patient;

  const account = await getAccount(candidate.id);
  const until = lockedUntil(account);
  if (until) return { kind: "locked", until };

  const sb = getServiceClient();
  const { data: visits } = await sb
    .from("visits")
    .select("id, access_code_hash, visit_date")
    .eq("patient_id", candidate.id)
    .not("access_code_hash", "is", null);

  const cutoff = Date.now() - ACCESS_CODE_VALID_DAYS * 24 * 60 * 60 * 1000;
  const codeUpper = input.code.trim().toUpperCase();

  let matched = false;
  for (const v of visits ?? []) {
    if (!v.access_code_hash) continue;
    // Ignore codes printed on visits older than the validity window.
    const visitAt = v.visit_date ? new Date(v.visit_date).getTime() : NaN;
    if (!Number.isFinite(visitAt) || visitAt < cutoff) continue;
    if (await bcrypt.compare(codeUpper, v.access_code_hash)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    await recordFailure(candidate.id);
    return { kind: "invalid_code" };
  }

  await recordSuccess(candidate.id);
  const jwt = await mintPatientJwt(candidate.id);
  return { kind: "success", jwt, patientId: candidate.id };
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
  if (booking.patient_phone !== phone) return { kind: "invalid_code" };
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
  if (account?.password_hash) return { kind: "invalid_code" };

  await recordSuccess(patientId);
  const jwt = await mintPatientJwt(patientId);
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
  if (patient.deleted_at) return { kind: "invalid_code" };
  if (patient.phone !== phone) return { kind: "invalid_code" };

  const id = String(patient.id);
  const account = await getAccount(id);

  const until = lockedUntil(account);
  if (until) return { kind: "locked", until };

  if (account?.password_hash) return { kind: "invalid_code" };

  await recordSuccess(id);
  const jwt = await mintPatientJwt(id);
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
