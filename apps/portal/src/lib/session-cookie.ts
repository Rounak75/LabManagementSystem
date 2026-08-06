// The session cookie's settings, in one place.
//
// They were written out at the login route and nowhere else, which was fine
// while login was the only thing that issued a session. Setting a password now
// reissues one too — it is what ends the must-set-password state — and a second
// hand-written copy of these flags is how one of them ends up without `secure`
// or without `httpOnly` months later, in whichever copy nobody was looking at.

import type { NextResponse } from "next/server";

export const COOKIE_NAME = "portal_session";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function setSessionCookie(res: NextResponse, jwt: string): void {
  res.cookies.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}
