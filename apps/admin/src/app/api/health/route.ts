// Liveness check for an external uptime monitor.
//
// The patient portal has had one of these; the staff portal has not — so the
// surface staff depend on twice a day was the one nothing watched. When it is
// down they find out with a patient in front of them.
//
// What this deliberately does NOT do, unlike the portal's version: it does not
// try to keep the free Supabase project awake. That check makes a real query
// against `cloud_heartbeat` using a service-role key, and this app has no
// service-role key by design — every database call here travels on a signed-in
// staff member's own JWT so RLS applies to it. The portal's check already owns
// the keep-awake job for the shared project, and duplicating it here would mean
// giving the staff portal a credential that bypasses RLS purely for monitoring.
//
// So this answers a narrower question honestly: is the app running, is it
// configured, and does the database host answer. That is what an uptime monitor
// needs, and it is the question staff are really asking.

import { NextResponse } from "next/server";

// Never cached. A cached health check reports the health of the cache.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A reachability probe should fail fast; a hung socket is a down host. */
const PROBE_TIMEOUT_MS = 4000;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  // Named, never valued. A health endpoint is unauthenticated.
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anon && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    !jwtSecret && "SUPABASE_JWT_SECRET",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    console.error("[health] missing environment variables", missing);
    return NextResponse.json(
      { status: "error", configured: false, missing },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let database: "reachable" | "unreachable" = "unreachable";
  try {
    // Any HTTP answer proves the host is up and routing. A 401 or 404 from
    // PostgREST is a perfectly healthy reply to an unprivileged probe — only a
    // transport failure or a timeout means down.
    const res = await fetch(`${url}/rest/v1/`, {
      method: "HEAD",
      headers: { apikey: anon as string },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status > 0) database = "reachable";
  } catch (e) {
    // Postgres and gateway errors routinely name hosts, roles and occasionally
    // credentials, so the caller is told "unreachable" and nothing else.
    console.error("[health] database unreachable", e);
  }

  const ok = database === "reachable";
  return NextResponse.json(
    {
      status: ok ? "ok" : "error",
      configured: true,
      database,
      checkedAt: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
