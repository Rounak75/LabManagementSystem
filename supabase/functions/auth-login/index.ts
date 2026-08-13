// Edge Function: validate username/password against synced users table,
// issue a JWT compatible with our RLS policies.
// Requires: { username, password } body.
// Returns: { token, user: { id, username, role } } on 200.
//   400 on bad input, 401 on bad credentials, 423 on lockout, 500 on db error.

import { createClient } from "supabase";
import * as bcrypt from "bcrypt";
import { create as jwtCreate } from "djwt";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Shared with Supabase's own JWT secret. Set via `supabase secrets set
// APP_JWT_SECRET=...` (the SUPABASE_ prefix is reserved by the platform).
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET")!;

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Attempts allowed from one address per window, across *all* usernames.
//
// The per-account lockout above stops someone guessing at one staff member's
// password. It does nothing about the other direction: one guess against each
// of many usernames. No single account's counter ever reaches five, so nothing
// engages — and the lab has three staff accounts with names a patient could
// guess, which makes that the easier attack of the two, not the harder one.
//
// The portal login has had this since 20260727000005; staff login never did.
// Thirty in ten minutes is far above three people signing in on a shared lab
// connection and far below anything worth calling an attempt.
const ORIGIN_MAX_ATTEMPTS = 30;
const ORIGIN_WINDOW_SECONDS = 600;

/**
 * A keyed digest of the caller's address, or null if the platform gave none.
 *
 * HMAC rather than a plain hash for the same reason as `login-throttle.ts` in
 * the portal: the table this feeds would otherwise be a record of who tried to
 * sign in from where, and the whole IPv4 space is only four billion digests.
 */
async function ipKeyFor(req: Request): Promise<string | null> {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = req.headers.get("x-real-ip")?.trim() || forwarded;
  if (!ip) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.username || !body.password) {
    return new Response("Missing credentials", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Counted before the username is looked up, so a spray across many usernames
  // is counted even though none of them exists.
  //
  // Fails open, deliberately: the lab has one admin and two staff, and locking
  // them out of their own system because a counter was unavailable would stop
  // patients being registered. The per-account lockout still stands underneath.
  const ipKey = await ipKeyFor(req).catch(() => null);
  if (ipKey) {
    try {
      const { data } = await supabase.rpc("hit_rate_limit", {
        p_bucket: "staffLogin",
        p_ip_key: ipKey,
        p_window_seconds: ORIGIN_WINDOW_SECONDS,
        p_max: ORIGIN_MAX_ATTEMPTS,
      });
      if (data && data.allowed === false) {
        return new Response("Too many attempts. Please wait and try again.", {
          status: 429,
          headers: { "Retry-After": String(data.retry_after_seconds ?? ORIGIN_WINDOW_SECONDS) },
        });
      }
    } catch {
      /* counting is best effort; never turn it into a failed staff login */
    }
  }
  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, password_hash, role, is_active, failed_attempts, locked_until")
    .eq("username", body.username)
    .maybeSingle();

  if (error || !user || !user.is_active) {
    return new Response("Invalid credentials", { status: 401 });
  }

  // DB-backed lockout — Edge Function isolates don't share in-memory state.
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return new Response("Too many failed attempts. Try again in 15 minutes.", { status: 423 });
  }

  // compareSync (not async compare) — the async path spawns a Web Worker that
  // is unavailable in the Supabase Edge (Deno Deploy) runtime.
  const ok = bcrypt.compareSync(body.password, user.password_hash);
  if (!ok) {
    // Counting used to be read-modify-write: read failed_attempts, add one,
    // write it back. Attempts issued in parallel all read the same value and all
    // wrote the same value, so the counter stayed at 1 however many guesses were
    // made and the 5-attempt lockout never engaged against a concurrent
    // attacker. Postgres does the increment in one statement now.
    await supabase.rpc("record_failed_staff_login", {
      p_user_id: user.id,
      p_max_failed: LOCKOUT_THRESHOLD,
      p_lockout_minutes: LOCKOUT_DURATION_MS / 60_000,
    });
    return new Response("Invalid credentials", { status: 401 });
  }

  // Successful login — reset the lockout counters.
  await supabase.rpc("record_successful_staff_login", { p_user_id: user.id });

  // Mint a Supabase-compatible JWT.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const token = await jwtCreate(
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      role: "authenticated", // PostgREST role
      user_id: user.id, // custom claim
      username: user.username, // custom claim
      role_app: user.role, // "Admin" | "Staff"
      exp: Math.floor(Date.now() / 1000) + 14 * 24 * 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    key,
  );

  return new Response(
    JSON.stringify({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
