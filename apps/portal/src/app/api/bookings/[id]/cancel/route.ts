// Phase 3d Plan F — cancel for a Pending booking.
// Optimistic concurrency via `version`: if the lab approves/declines in the
// same instant, the cancel returns 409 and the patient is told to refresh.
//
// This route used to be unauthenticated, on the stated grounds that knowing
// `BKG-YYYY-NNNNN` was the capability. It is not one: the id is allocated in
// sequence, so counting through it cancelled every pending home collection in
// the lab's book, and the patients would have discovered that by waiting in for
// a phlebotomist nobody had dispatched.
//
// It now requires the same thing `tryBookingIdLogin` requires of the same id —
// the phone number on the booking — proven once at
// `POST /api/bookings/[id]/verify-phone` and carried in a short-lived cookie.

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@portal/lib/supabase-server";
import { enforceRateLimit } from "@portal/lib/rate-limit";
import { BOOKING_ACCESS_COOKIE, verifyBookingAccess } from "@portal/lib/booking-access";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit("bookingCancel", req);
  if (limited) return limited;

  const params = await paramsPromise;

  // Checked against *this* booking, not merely checked for validity. A token is
  // minted per booking precisely so that holding one for your own cannot open
  // anyone else's.
  const unlocked = await verifyBookingAccess(
    req.cookies.get(BOOKING_ACCESS_COOKIE)?.value,
    params.id,
  );
  if (!unlocked) {
    return NextResponse.json(
      {
        error: "not_verified",
        message: "Please confirm the phone number you booked with, then try again.",
      },
      { status: 401 },
    );
  }

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
