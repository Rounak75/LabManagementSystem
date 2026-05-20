// Phase 3d Plan F — public booking submission.
// Validates captcha + required fields, dedups submissions made within the last
// 5 minutes against the same (phone, preferredDate), generates BKG-YYYY-NNNNN,
// and inserts a `bookings` row. The desktop pulls it within 10s via Phase 3c
// sync worker.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getServiceClient } from "@portal/lib/supabase-server";
import { verifyPuzzle } from "@portal/lib/captcha";

export const runtime = "nodejs";

const SLOTS = new Set(["Morning", "Afternoon", "Evening"]);

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
  const pincodeRaw = body.pincode ? String(body.pincode).replace(/\D/g, "") : "";
  const pincode = pincodeRaw.length === 6 ? pincodeRaw : null;
  const testIds: string[] = Array.isArray(body.testIds) ? body.testIds.map(String) : [];
  const preferredDate = String(body.preferredDate ?? "");
  const preferredSlot = String(body.preferredSlot ?? "Morning");
  const notes = body.notes ? String(body.notes).trim() || null : null;

  if (!patientName) {
    return NextResponse.json({ error: "missing_name", message: "Please enter the patient's name." }, { status: 400 });
  }
  if (patientPhone.length !== 10) {
    return NextResponse.json({ error: "bad_phone", message: "Phone must be 10 digits." }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ error: "missing_address", message: "Please enter a collection address." }, { status: 400 });
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

  const sb = getServiceClient();

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

  const bookingId = await nextBookingId(sb);
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

// BKG-YYYY-NNNNN — count this year's bookings + 1. Not atomic but the lab sees
// ~10 bookings/day max; a duplicate would surface as a unique-violation and
// the caller would retry.
async function nextBookingId(sb: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getUTCFullYear();
  const { count } = await sb
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${year}-01-01T00:00:00Z`)
    .lt("created_at", `${year + 1}-01-01T00:00:00Z`);
  const seq = String((count ?? 0) + 1).padStart(5, "0");
  return `BKG-${year}-${seq}`;
}
