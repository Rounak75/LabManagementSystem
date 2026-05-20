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

export type PatientSummary = { id: string; name: string; age: number; sex: string };

export type LoginResult =
  | { kind: "no_patient" }
  | { kind: "needs_chooser"; patients: PatientSummary[] }
  | { kind: "invalid_code" }
  | { kind: "locked"; until: string }
  | { kind: "success"; jwt: string; patientId: string };

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

async function isLocked(account: { locked_until: string | null } | null): Promise<string | null> {
  if (!account?.locked_until) return null;
  if (new Date(account.locked_until) > new Date()) return account.locked_until;
  return null;
}

async function bumpFailed(patientId: string, account: { id?: string; failed_attempts?: number; version?: number } | null) {
  const sb = getServiceClient();
  const nowFailed = (account?.failed_attempts ?? 0) + 1;
  const updates: Record<string, unknown> = { failed_attempts: nowFailed };
  if (nowFailed >= MAX_FAILED) {
    updates.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
  }
  if (account?.id) {
    await sb
      .from("patient_accounts")
      .update({ ...updates, version: (account.version ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("id", account.id);
  } else {
    await sb.from("patient_accounts").insert({
      id: crypto.randomUUID(),
      patient_id: patientId,
      failed_attempts: nowFailed,
      locked_until: updates.locked_until ?? null,
      version: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

async function clearAndStamp(patientId: string, account: { id?: string; version?: number } | null) {
  const sb = getServiceClient();
  const now = new Date().toISOString();
  if (account?.id) {
    await sb
      .from("patient_accounts")
      .update({ failed_attempts: 0, locked_until: null, last_login_at: now, updated_at: now, version: (account.version ?? 0) + 1 })
      .eq("id", account.id);
  } else {
    await sb.from("patient_accounts").insert({
      id: crypto.randomUUID(),
      patient_id: patientId,
      last_login_at: now,
      created_at: now,
      updated_at: now,
      version: 0,
    });
  }
}

export async function tryLogin(input: {
  phone: string;
  code: string;
  patientId?: string;
}): Promise<LoginResult> {
  const patients = await lookupPatientsByPhone(input.phone);
  if (patients.length === 0) return { kind: "no_patient" };

  if (patients.length > 1 && !input.patientId) {
    return { kind: "needs_chooser", patients };
  }
  const candidate = input.patientId
    ? patients.find((p) => p.id === input.patientId)
    : patients[0];
  if (!candidate) return { kind: "invalid_code" };

  const account = await getAccount(candidate.id);
  const lockedUntil = await isLocked(account);
  if (lockedUntil) return { kind: "locked", until: lockedUntil };

  const sb = getServiceClient();
  const { data: visits } = await sb
    .from("visits")
    .select("id, access_code_hash")
    .eq("patient_id", candidate.id)
    .not("access_code_hash", "is", null);

  const codeUpper = input.code.trim().toUpperCase();
  let matched = false;
  for (const v of visits ?? []) {
    if (v.access_code_hash && (await bcrypt.compare(codeUpper, v.access_code_hash))) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    await bumpFailed(candidate.id, account);
    return { kind: "invalid_code" };
  }

  await clearAndStamp(candidate.id, account);
  const jwt = await mintPatientJwt(candidate.id);
  return { kind: "success", jwt, patientId: candidate.id };
}

export async function tryPasswordLogin(phone: string, password: string): Promise<LoginResult> {
  const patients = await lookupPatientsByPhone(phone);
  if (patients.length === 0) return { kind: "no_patient" };
  if (patients.length > 1) return { kind: "needs_chooser", patients };

  const patient = patients[0]!;
  const account = await getAccount(patient.id);
  if (!account?.password_hash) return { kind: "invalid_code" };

  const lockedUntil = await isLocked(account);
  if (lockedUntil) return { kind: "locked", until: lockedUntil };

  const ok = await bcrypt.compare(password, account.password_hash);
  if (!ok) {
    await bumpFailed(patient.id, account);
    return { kind: "invalid_code" };
  }
  await clearAndStamp(patient.id, account);
  const jwt = await mintPatientJwt(patient.id);
  return { kind: "success", jwt, patientId: patient.id };
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
