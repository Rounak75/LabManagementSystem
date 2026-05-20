import { cache } from "react";
import { unstable_cache } from "next/cache";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getServerSupabase } from "./supabase-client";
import { CACHE_TAGS } from "./cache-tags";

const COOKIE_NAME = "admin_session";
const COOKIE_MAX_AGE = 14 * 24 * 60 * 60;

export interface JWTPayload {
  sub: string;
  user_id: string;
  username: string;
  role_app: "Admin" | "Staff";
  exp: number;
  iat: number;
}

export interface SessionUser {
  id: string;
  username: string;
  role: "Admin" | "Staff";
  token: string;
}

// The "sign out everywhere" check hits the cloud on every navigation. Cache the
// epoch lookup (busted by the sign-out-everywhere route via revalidateTag) so it
// isn't a network round-trip per page. Trade-off: a remote sign-out that somehow
// doesn't bust the tag still takes effect within the 60s revalidate window.
const getSessionEpoch = unstable_cache(
  async (token: string, userId: string): Promise<number> => {
    const sb = getServerSupabase(token);
    const { data } = await sb.from("users").select("session_epoch").eq("id", userId).maybeSingle();
    return Number(data?.session_epoch ?? 0);
  },
  ["session-epoch"],
  { tags: [CACHE_TAGS.sessionEpoch], revalidate: 60 },
);

export async function verifyJWT(
  token: string,
  secret = process.env.SUPABASE_JWT_SECRET!,
): Promise<JWTPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  return payload as unknown as JWTPayload;
}

export function encodeSessionPayload(p: { token: string; expiresAt: number }): string {
  return Buffer.from(JSON.stringify(p)).toString("base64url");
}

export function decodeSessionPayload(enc: string): { token: string; expiresAt: number } {
  return JSON.parse(Buffer.from(enc, "base64url").toString("utf-8"));
}

// Next 14 `cookies()` is synchronous; these stay async for call-site ergonomics.
export async function setSessionCookie(token: string, expiresAtSec: number): Promise<void> {
  const enc = encodeSessionPayload({ token, expiresAt: expiresAtSec * 1000 });
  cookies().set({
    name: COOKIE_NAME,
    value: enc,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  cookies().delete(COOKIE_NAME);
}

// Per-request memoized: the authed layout and the page it renders both call
// this, so without caching every navigation pays two JWT verifies + two
// session_epoch network round-trips. cache() collapses them into one.
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return null;
  try {
    const { token, expiresAt } = decodeSessionPayload(c.value);
    if (expiresAt < Date.now()) return null;
    const payload = await verifyJWT(token);

    // "Sign out everywhere": reject tokens minted before the user's session epoch.
    // Fail open on any error (e.g. column not yet migrated, cloud blip) so a
    // transient issue can't lock the lab out.
    try {
      const epoch = await getSessionEpoch(token, payload.user_id);
      if (epoch > 0 && payload.iat * 1000 < epoch) return null;
    } catch {
      /* fail open */
    }

    return {
      id: payload.user_id,
      username: payload.username,
      role: payload.role_app,
      token,
    };
  } catch {
    return null;
  }
});
