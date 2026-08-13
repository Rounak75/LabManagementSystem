// Trades the phone number on a booking for a short-lived token that unlocks it.
//
// This is the gate in front of the status page and the cancel route. See
// `lib/booking-access.ts` for why it exists; the short version is that
// `BKG-YYYY-NNNNN` counts upwards, so the id alone was never a credential.

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@portal/lib/supabase-server";
import { mintBookingAccess, setBookingAccessCookie } from "@portal/lib/booking-access";
import { enforceRateLimit } from "@portal/lib/rate-limit";
import { isValidMobile } from "@portal/lib/phone";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  // Before the lookup, so a script guessing numbers is counted whether or not
  // the booking it names exists.
  const limited = await enforceRateLimit("bookingAccess", req);
  if (limited) return limited;

  const params = await paramsPromise;
  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  if (!isValidMobile(phone)) {
    return NextResponse.json(
      { error: "bad_phone", message: "Please enter the 10-digit mobile number you booked with." },
      { status: 400 },
    );
  }

  const bookingId = String(params.id ?? "").trim().toUpperCase();
  const sb = getServiceClient();
  const { data: booking } = await sb
    .from("bookings")
    .select("booking_id, patient_phone, created_at")
    .eq("booking_id", bookingId)
    .maybeSingle();

  // One message for "no such booking" and for "wrong number", because telling
  // them apart is a way of asking which booking ids exist — the same reasoning
  // the login paths give for their single `invalid_code`.
  const ok = booking && booking.patient_phone === phone;
  if (!ok) {
    return NextResponse.json(
      {
        error: "no_match",
        message: "That number does not match this booking. Please check and try again.",
      },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  setBookingAccessCookie(res, await mintBookingAccess(booking.booking_id));
  return res;
}
