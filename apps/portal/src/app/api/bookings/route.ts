// Phase 3d Plan F — public booking submission.
// Validates captcha + required fields, dedups submissions made within the last
// 5 minutes against the same (phone, preferredDate), generates BKG-YYYY-NNNNN,
// and inserts a `bookings` row. The desktop pulls it within 10s via Phase 3c
// sync worker.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getServiceClient } from "@portal/lib/supabase-server";
import { verifyPuzzle } from "@portal/lib/captcha";
import { INVALID_PHONE_MESSAGE, isValidMobile } from "@portal/lib/phone";
import {
  slotHasPassed,
  slotsAvailableOn,
  type ClosureRow,
  type LabConfig,
  type Slot,
} from "@portal/lib/lab-status";

export const runtime = "nodejs";

const SLOTS = new Set(["Morning", "Afternoon", "Evening"]);

/**
 * Midnight of the lab's current day, as a UTC instant.
 *
 * `preferredDate` arrives as YYYY-MM-DD and parses to UTC midnight of that
 * calendar day, so shifting "now" into IST and taking its UTC date parts puts
 * both sides on the same footing.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istStartOfToday(now: number = Date.now()): number {
  const ist = new Date(now + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

function parseWeeklyHolidays(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Why this slot cannot be booked on this day, or null if it can.
 *
 * Fails open. If the settings or closure rows cannot be read, the booking is
 * allowed through: staff confirm every booking by phone, so an occasional one
 * on a closed day costs a call, while refusing a real request because a lookup
 * blipped costs the patient their appointment and the lab the work.
 */
async function slotUnavailableReason(
  sb: ReturnType<typeof getServiceClient>,
  date: Date,
  slot: Slot,
): Promise<string | null> {
  try {
    const dayStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const [{ data: settings }, { data: closures }] = await Promise.all([
      sb
        .from("lab_settings")
        .select(
          "morning_open_time, morning_close_time, evening_open_time, evening_close_time, weekly_holidays, is_open_today, manual_closure_reason",
        )
        .eq("id", "singleton")
        .maybeSingle(),
      sb
        .from("lab_closures")
        .select("date, reason")
        .gte("date", dayStart.toISOString())
        .lt("date", dayEnd.toISOString()),
    ]);

    if (!settings) return null;

    const cfg: LabConfig = {
      morningOpenTime: settings.morning_open_time ?? "08:00",
      morningCloseTime: settings.morning_close_time ?? "13:00",
      eveningOpenTime: settings.evening_open_time ?? null,
      eveningCloseTime: settings.evening_close_time ?? null,
      weeklyHolidays: parseWeeklyHolidays(settings.weekly_holidays),
      isOpenToday: settings.is_open_today ?? true,
      manualClosureReason: settings.manual_closure_reason ?? null,
    };

    const rows: ClosureRow[] = (closures ?? []).map((c) => ({
      date: String(c.date),
      reason: c.reason ?? null,
    }));

    const available = slotsAvailableOn(cfg, rows, date);
    if (available.includes(slot)) return null;

    const reason = rows[0]?.reason;
    if (available.length === 0) {
      return reason
        ? `The lab is closed that day — ${reason}. Please pick another date.`
        : "The lab is closed on that date. Please pick another date.";
    }
    return "That slot isn't collected on the day you picked. Please choose another slot.";
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad_json" }, { status: 400 });

  const captchaOk = await verifyPuzzle(
    String(body.captchaToken ?? ""),
    Number(body.captchaAnswer),
  );
  if (!captchaOk) return NextResponse.json({ error: "captcha_failed" }, { status: 400 });

  const patientName = String(body.patientName ?? "").trim();
  const patientPhone = String(body.patientPhone ?? "").replace(/\D/g, "");
  const patientEmail = body.patientEmail ? String(body.patientEmail).trim() : null;
  const address = String(body.address ?? "").trim();
  // A wrong-length PIN code used to be quietly discarded, so a typo produced a
  // booking with no PIN at all and the phlebotomist found out at the door.
  const pincode = body.pincode ? String(body.pincode).replace(/\D/g, "") : "";
  const testIds: string[] = Array.isArray(body.testIds) ? body.testIds.map(String) : [];
  const preferredDate = String(body.preferredDate ?? "");
  const preferredSlot = String(body.preferredSlot ?? "Morning");
  const notes = body.notes ? String(body.notes).trim() || null : null;

  if (!patientName) {
    return NextResponse.json({ error: "missing_name", message: "Please enter the patient's name." }, { status: 400 });
  }
  if (!isValidMobile(patientPhone)) {
    return NextResponse.json(
      { error: "bad_phone", message: INVALID_PHONE_MESSAGE },
      { status: 400 },
    );
  }
  if (!address) {
    return NextResponse.json({ error: "missing_address", message: "Please enter a collection address." }, { status: 400 });
  }
  if (pincode.length !== 6) {
    return NextResponse.json(
      { error: "bad_pincode", message: "Please enter a 6-digit PIN code." },
      { status: 400 },
    );
  }
  if (testIds.length === 0) {
    return NextResponse.json({ error: "no_tests", message: "Please choose at least one test." }, { status: 400 });
  }
  if (!SLOTS.has(preferredSlot)) {
    return NextResponse.json({ error: "bad_slot" }, { status: 400 });
  }
  const dateObj = new Date(preferredDate);
  if (Number.isNaN(dateObj.getTime())) {
    return NextResponse.json({ error: "bad_date", message: "Please pick a valid date." }, { status: 400 });
  }
  // A date already past cannot be collected, and the form only ever offers
  // future ones — but the form is not the only thing that can post here, and a
  // booking dated 2020 lands in staff's queue looking like a real request.
  //
  // "Today" is the lab's today. Comparing against the server's UTC date would
  // refuse a same-day booking made before 05:30 IST, which is exactly when
  // someone books a fasting test for that morning.
  if (dateObj.getTime() < istStartOfToday()) {
    return NextResponse.json(
      { error: "past_date", message: "Please pick today's date or a later one." },
      { status: 400 },
    );
  }

  const sb = getServiceClient();

  // The lab has to be open on the day, for that slot.
  //
  // The form already refuses to offer a closed day, but a booking is not only
  // ever made through the form, and one landing on a day the lab is shut looks
  // exactly like a real request in staff's queue — someone rings a patient to
  // arrange a visit that was never possible.
  //
  // `slotsAvailableOn` is the same rule the form applies, so the two cannot
  // drift: it accounts for one-off closures, whole weekly holidays and days
  // where only one session is closed.
  // Checked before the closure lookup so the patient is told the real reason.
  // `slotsAvailableOn` also drops passed slots, but with every slot of the day
  // gone it returns an empty list, which reads as "the lab is closed on that
  // date" — untrue, and it sends the patient hunting for another day when the
  // next slot is a few hours away.
  if (slotHasPassed(preferredSlot as Slot, dateObj)) {
    return NextResponse.json(
      {
        error: "slot_passed",
        message: "That collection time has already passed today. Please pick a later slot or another day.",
      },
      { status: 400 },
    );
  }

  const closedReason = await slotUnavailableReason(sb, dateObj, preferredSlot as Slot);
  if (closedReason) {
    return NextResponse.json(
      { error: "lab_closed", message: closedReason },
      { status: 400 },
    );
  }

  // Reject duplicate submissions: same phone + same preferred date within 5 min.
  // (Browsers occasionally double-submit; this also blunts naive replay.)
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: recent } = await sb
    .from("bookings")
    .select("booking_id")
    .eq("patient_phone", patientPhone)
    .eq("preferred_date", dateObj.toISOString())
    .gt("created_at", fiveMinAgo)
    .limit(1);
  if (recent && recent.length > 0) {
    return NextResponse.json({ bookingId: recent[0].booking_id, deduped: true });
  }

  let bookingId: string;
  try {
    bookingId = await nextBookingId(sb);
  } catch {
    // Same wording as a failed insert: from the patient's side both mean "your
    // booking was not saved", and neither is something they can act on beyond
    // trying again.
    return NextResponse.json(
      { error: "insert_failed", message: "Could not save your booking. Please try again." },
      { status: 500 },
    );
  }
  const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const id = randomUUID();
  const nowIso = new Date().toISOString();

  const { error } = await sb.from("bookings").insert({
    id,
    booking_id: bookingId,
    patient_phone: patientPhone,
    patient_name: patientName,
    patient_email: patientEmail,
    address,
    pincode,
    test_ids: JSON.stringify(testIds),
    preferred_date: dateObj.toISOString(),
    preferred_slot: preferredSlot,
    notes,
    status: "Pending",
    version: 0,
    source_ip: sourceIp,
    captcha_passed: true,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (error) {
    return NextResponse.json(
      { error: "insert_failed", message: "Could not save your booking. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ bookingId, id });
}

/**
 * BKG-YYYY-NNNNN, allocated atomically in the database.
 *
 * This used to count the year's bookings and add one. Two people booking at the
 * same moment both counted the same total and built the same id, and
 * `bookings.booking_id` is unique — so the second insert failed and that
 * patient's request was lost behind a generic "please try again". The comment
 * here justified it on the grounds that the caller would retry; nothing did.
 * It also failed at exactly the wrong time, when several people book at once.
 *
 * Numbers now come from id_reservations, the same allocator visit ids use, under
 * an advisory lock on the prefix.
 */
async function nextBookingId(sb: ReturnType<typeof getServiceClient>): Promise<string> {
  const { data, error } = await sb.rpc("next_booking_id", {
    p_year: new Date().getUTCFullYear(),
  });
  if (error || !data) {
    throw new Error(`could not allocate booking id: ${error?.message ?? "no id returned"}`);
  }
  return data as string;
}
