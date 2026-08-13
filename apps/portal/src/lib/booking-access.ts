// Proof that whoever is asking about a booking is the person who made it.
//
// The problem this exists to solve: `BKG-YYYY-NNNNN` is allocated in sequence,
// so anyone can count through it. Two surfaces used to trust that id on its own —
// the status page, which shows the patient's name and when a phlebotomist is
// coming to their house, and the cancel route, which cancels the visit. Walking
// the sequence therefore read out a list of names and addresses-by-implication,
// and cancelled every pending home collection in it. The patients would have
// found out by waiting in for someone who was never dispatched.
//
// The bar used here is the one this codebase already set for exactly this id:
// `tryBookingIdLogin` refuses a booking id unless the phone number on the
// booking comes with it, on the stated grounds that the id is the half an
// attacker gets for free. The same rule now guards the same id everywhere.
//
// Rather than asking for the phone number on every request, one successful check
// mints a short-lived signed token. The token names the booking it was minted
// for, so it unlocks that booking and no other — holding a token for your own
// booking must not become a way past the check on somebody else's.

import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";

const ALG = "HS256";
const KIND = "booking_access";

/**
 * How long one phone check is good for.
 *
 * Long enough to submit the booking, read the status page, think about it and
 * come back to cancel; short enough that a shared or borrowed phone does not
 * leave the booking standing open. Nothing renews it — an hour after proving
 * the phone, the patient proves it again.
 */
export const BOOKING_ACCESS_TTL_SECS = 60 * 60;

/**
 * One cookie, with the booking id inside the token rather than in the name.
 *
 * The alternative was a cookie per booking (`booking_access_BKG-2026-00042`),
 * which avoids the one downside here: a patient with two open bookings who flips
 * between them is asked for the phone again each time. That was not worth
 * building a name out of a path parameter for — a value that reaches a `Set-Cookie`
 * header is a value that has to be proven safe first, and "ask for the phone
 * number again" is a mild cost for not having to prove it.
 */
export const BOOKING_ACCESS_COOKIE = "booking_access";

function getSecret(): Uint8Array {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) throw new Error("SUPABASE_JWT_SECRET missing");
  return new TextEncoder().encode(s);
}

/** A token proving the holder knew the phone number on this specific booking. */
export async function mintBookingAccess(bookingId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ kind: KIND, bid: bookingId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + BOOKING_ACCESS_TTL_SECS)
    .sign(getSecret());
}

/**
 * Whether this token unlocks this booking.
 *
 * Both halves are checked: that the signature is ours, and that the booking it
 * names is the one being asked about. Checking only the signature would make any
 * valid token a key to every booking, which is the bug this whole module exists
 * to avoid — the same shape as the admin middleware requiring staff claims
 * rather than trusting a signature the patient portal can also produce.
 */
export async function verifyBookingAccess(
  token: string | undefined,
  bookingId: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.kind === KIND && payload.bid === bookingId;
  } catch {
    return false;
  }
}

/** Cookie settings, in one place, so the two callers cannot drift apart. */
export function setBookingAccessCookie(res: NextResponse, token: string): void {
  res.cookies.set(BOOKING_ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // `strict` rather than `lax`: nothing links into a booking from another
    // site, so there is no cross-site navigation that needs to carry this.
    sameSite: "strict",
    maxAge: BOOKING_ACCESS_TTL_SECS,
    path: "/",
  });
}
