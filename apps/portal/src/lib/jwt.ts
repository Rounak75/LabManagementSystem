// Portal session JWT — signed with the same SUPABASE_JWT_SECRET that Supabase
// uses to sign its own auth tokens, so Postgres RLS policies recognise it via
// `auth.jwt() ->> 'patient_id'`.

import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const ISSUER = "supabase";
const SESSION_TTL_SECS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): Uint8Array {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) throw new Error("SUPABASE_JWT_SECRET missing");
  return new TextEncoder().encode(s);
}

export interface PatientJwtPayload {
  patient_id: string;
  iat: number;
  exp: number;
  iss: string;
  role: string;
  sub: string;
}

export async function mintPatientJwt(patientId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    patient_id: patientId,
    role: "anon",
    sub: patientId,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECS)
    .setIssuer(ISSUER)
    .sign(getSecret());
}

export async function verifyPatientJwt(token: string): Promise<PatientJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER });
  if (typeof payload.patient_id !== "string") throw new Error("JWT_MISSING_PATIENT_ID");
  return payload as unknown as PatientJwtPayload;
}
