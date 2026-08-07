// Portal session JWT — signed with the same SUPABASE_JWT_SECRET that Supabase
// uses to sign its own auth tokens, so Postgres RLS policies recognise it via
// `auth.jwt() ->> 'patient_id'`.

import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const ISSUER = "supabase";

/**
 * How long a real session lasts — one opened with a password, or with a code
 * the patient had to be handed.
 *
 * Kept short because nothing else can end a session. Logging out clears the
 * cookie but not the token; changing the password does not invalidate tokens
 * already minted, since `verifyPatientJwt` checks only signature, issuer and
 * expiry. This number *is* the revocation policy, and the token is honoured by
 * Supabase directly — whoever holds one reads that patient's results straight
 * from the database, portal or no portal.
 *
 * Nothing renews mid-life, so this is also a hard cap on an active patient.
 * Seven days covers the case that matters — waiting on results from a visit —
 * and anyone returning months later was signing in again regardless.
 */
export const SESSION_TTL_SECS = 7 * 24 * 60 * 60;

/**
 * How long a half-session lasts: one opened with a booking id or a patient id.
 *
 * Both are `BKG-YYYY-NNNNN`-shaped and guessable by counting, which is why the
 * middleware pins these sessions to the password page. They buy exactly one
 * trip there, so they only have to outlive the walk from the login form to a
 * chosen password — not a month of standing open, which is what they used to
 * get by sharing the full session's lifetime.
 */
export const SETUP_TTL_SECS = 30 * 60;

function getSecret(): Uint8Array {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) throw new Error("SUPABASE_JWT_SECRET missing");
  return new TextEncoder().encode(s);
}

export interface PatientJwtPayload {
  patient_id: string;
  /**
   * Present only on a session opened with a booking id or a patient id.
   *
   * Those two credentials are guessable by counting and never expire, so the
   * session they open is not a full one: the middleware holds it at the password
   * page until the patient trades it for something only they know. The
   * requirement travels in the token because the middleware sees every request
   * and has nothing else to go on — a redirect from the login response was
   * advice the browser was free to ignore, and typing /dashboard did ignore it.
   */
  must_set_password?: true;
  iat: number;
  exp: number;
  iss: string;
  role: string;
  sub: string;
}

export async function mintPatientJwt(
  patientId: string,
  opts: { mustSetPassword?: boolean } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.mustSetPassword ? SETUP_TTL_SECS : SESSION_TTL_SECS;
  return await new SignJWT({
    patient_id: patientId,
    role: "anon",
    sub: patientId,
    // Absent rather than false on an ordinary session, so the claim can only
    // ever add a restriction and never quietly lift one.
    ...(opts.mustSetPassword ? { must_set_password: true as const } : {}),
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setIssuer(ISSUER)
    .sign(getSecret());
}

export async function verifyPatientJwt(token: string): Promise<PatientJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER });
  if (typeof payload.patient_id !== "string") throw new Error("JWT_MISSING_PATIENT_ID");
  return payload as unknown as PatientJwtPayload;
}
