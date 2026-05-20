// Server-side helper for authed pages: pulls patient_id from the cookie.
// Throws if missing/invalid — caller redirects to /login.

import { cookies } from "next/headers";
import { verifyPatientJwt } from "./jwt";

export async function requirePatient(): Promise<{ patientId: string; jwt: string }> {
  const cookie = cookies().get("portal_session")?.value;
  if (!cookie) throw new Error("NOT_LOGGED_IN");
  const payload = await verifyPatientJwt(cookie);
  return { patientId: payload.patient_id, jwt: cookie };
}

export async function tryGetPatient(): Promise<{ patientId: string; jwt: string } | null> {
  try { return await requirePatient(); } catch { return null; }
}
