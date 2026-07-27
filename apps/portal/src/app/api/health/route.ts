// Liveness check for an external uptime monitor.
//
// It exists for two reasons, and the second is the one that shapes it.
//
// 1. Uptime. Nothing currently tells the owner the portal is down; they find
//    out when a patient phones. A free monitor polling this endpoint closes
//    that.
//
// 2. The free Supabase project pauses after seven days without activity, and
//    resuming it is a manual click in a dashboard. A festival week with the lab
//    shut and the home PC off is enough to trigger it, and the failure is
//    silent until someone tries to use the portal. Internal pg_cron jobs are
//    not a dependable guard — the inactivity signal tracks external API
//    traffic — so the check has to make a *real query* rather than return a
//    static 200. The test suite asserts that it does; a health check that
//    stopped touching Postgres would keep passing while quietly letting the
//    project fall asleep.
//
// `cloud_heartbeat` is the cheapest honest thing to read: one row, two columns,
// and it doubles as a report on how long ago the desktop last pushed.

import { NextResponse } from "next/server";
import { getServiceClient } from "@portal/lib/supabase-server";

// Never cached. A cached health check reports the health of the cache.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Beyond this, the desktop has almost certainly stopped syncing rather than
 *  merely paused between ticks. The sync worker backs off to at most five
 *  minutes when the cloud is unreachable, so 30 is comfortably outside normal. */
const STALE_AFTER_MINUTES = 30;

export async function GET() {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("cloud_heartbeat")
    .select("last_pushed_at")
    .eq("id", "singleton")
    .maybeSingle();

  if (error) {
    // The caller is unauthenticated, so it is told that the database is
    // unreachable and nothing else. Postgres error text routinely names roles,
    // hosts and occasionally credentials.
    console.error("[health] database unreachable", error);
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Freshness is reported, never fatal. A stale heartbeat means the home PC is
  // off — which is normal overnight and every Sunday. Failing the check for it
  // would page the owner about an expected condition until they stopped reading
  // the alerts, taking the genuine outage signal down with it.
  const { fresh, ageMinutes } = describeStaleness(data?.last_pushed_at);

  return NextResponse.json(
    {
      status: "ok",
      database: "reachable",
      syncFresh: fresh,
      syncAgeMinutes: ageMinutes,
      checkedAt: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * How long ago the desktop last pushed, or nulls when that cannot be known.
 *
 * Both unknown cases — no heartbeat row on a cloud the desktop has never pushed
 * to, and a timestamp that will not parse — report `null` rather than `false`.
 * Reporting them as "not fresh" would raise a sync alarm on a lab that has
 * simply not finished setting up, and reporting them as fresh would hide a real
 * one.
 */
function describeStaleness(
  lastPushedAt: unknown,
): { fresh: boolean | null; ageMinutes: number | null } {
  if (typeof lastPushedAt !== "string") return { fresh: null, ageMinutes: null };

  const pushedAt = new Date(lastPushedAt);
  if (Number.isNaN(pushedAt.getTime())) return { fresh: null, ageMinutes: null };

  const ageMinutes = Math.floor((Date.now() - pushedAt.getTime()) / 60_000);
  return { fresh: ageMinutes < STALE_AFTER_MINUTES, ageMinutes };
}
