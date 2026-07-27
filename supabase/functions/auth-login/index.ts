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
