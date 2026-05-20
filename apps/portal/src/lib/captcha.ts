// Phase 3d Plan F — server-issued math captcha for the public /book form.
// The expected answer is encoded in a short-lived JWT signed with the same
// SUPABASE_JWT_SECRET. The client renders the question and ships the token
// back with its answer; we re-verify here before accepting the booking.

import { SignJWT, jwtVerify } from "jose";

const TTL_SECS = 10 * 60;
const ALG = "HS256";

function getSecret(): Uint8Array {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) throw new Error("SUPABASE_JWT_SECRET missing");
  return new TextEncoder().encode(s);
}

export interface Puzzle {
  question: string;
  token: string;
}

export async function issuePuzzle(): Promise<Puzzle> {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ ans: a + b, kind: "captcha" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECS)
    .sign(getSecret());
  return { question: `What is ${a} + ${b}?`, token };
}

export async function verifyPuzzle(token: string, answer: number): Promise<boolean> {
  if (!token || !Number.isFinite(answer)) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.kind === "captcha" && payload.ans === answer;
  } catch {
    return false;
  }
}
