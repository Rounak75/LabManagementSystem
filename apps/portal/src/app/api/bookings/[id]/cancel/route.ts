// Phase 3d Plan F — public cancel for a Pending booking.
// Optimistic concurrency via `version`: if the lab approves/declines in the
// same instant, the cancel returns 409 and the patient is told to refresh.
//
// The route is unauthenticated by design — the bookingId itself is the only
// identifier the patient was given. Knowledge of BKG-YYYY-NNNNN is treated as
// the capability. RLS on `bookings` blocks reads past 7 days (spec §7.7).

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@portal/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = getServiceClient();
  const { data: row } = await sb
    .from("bookings")
    .select("id, status, version")
    .eq("booking_id", params.id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (row.status !== "Pending") {
    const message =
      row.status === "Approved"
        ? "This booking was already confirmed by the lab. Please call us to cancel."
        : `This booking is already ${String(row.status).toLowerCase()}.`;
    return NextResponse.json({ error: "not_pending", message }, { status: 409 });
  }

  const { data: updated, error } = await sb
    .from("bookings")
    .update({
      status: "Cancelled",
      version: row.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("version", row.version)
    .select("id");

  if (error || !updated || updated.length === 0) {
    return NextResponse.json(
      { error: "conflict", message: "The booking was just updated by the lab. Please refresh and try again." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
