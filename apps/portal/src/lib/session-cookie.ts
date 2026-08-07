// The session cookie's settings, in one place.
//
// They were written out at the login route and nowhere else, which was fine
// while login was the only thing that issued a session. Setting a password now
// reissues one too — it is what ends the must-set-password state — and a second
// hand-written copy of these flags is how one of them ends up without `secure`
// or without `httpOnly` months later, in whichever copy nobody was looking at.

import type { NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { SESSION_TTL_SECS } from "./jwt";

export const COOKIE_NAME = "portal_session";

/**
 * How long the browser should keep the cookie: exactly as long as the token
 * inside it is good for.
 *
 * Read off the token rather than held as a second constant, because there is
 * now more than one session length — a half-session expires in half an hour
 * where a real one lasts a week — and a cookie carrying its own idea of the
 * answer is how those two drift apart. Drift in one direction leaves the
 * patient looking signed in until the first click bounces them to /login; in
 * the other it throws away a session the token would still have honoured.
 */
function maxAgeFor(jwt: string): number {
  const { exp } = decodeJwt(jwt);
  // Only reachable if a token were minted without an expiry, which
  // `mintPatientJwt` never does. Falling back to the shorter-lived assumption
  // beats persisting a cookie forever.
  if (typeof exp !== "number") return SESSION_TTL_SECS;
  return Math.max(0, exp - Math.floor(Date.now() / 1000));
}

export function setSessionCookie(res: NextResponse, jwt: string): void {
  res.cookies.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: maxAgeFor(jwt),
    path: "/",
  });
}
