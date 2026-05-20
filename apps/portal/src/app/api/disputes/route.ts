import { NextRequest, NextResponse } from "next/server";
import { verifyPatientJwt } from "@portal/lib/jwt";
import { getServiceClient } from "@portal/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value;
  if (!cookie) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  let payload;
  try { payload = await verifyPatientJwt(cookie); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const sb = getServiceClient();
  await sb.from("disputes").insert({
    id: crypto.randomUUID(),
    patient_id: payload.patient_id,
    reason: "phone_recycled",
    status: "Open",
    created_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
