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

  const body = await req.json();
  const invoiceId = String(body.invoiceId ?? "");
  if (!invoiceId) return NextResponse.json({ error: "missing_invoice" }, { status: 400 });

  const sb = getServiceClient();

  // Verify the invoice actually belongs to this patient (defence-in-depth on top of RLS).
  const { data: invoice } = await sb
    .from("invoices")
    .select("id, visits(patient_id)")
    .eq("id", invoiceId)
    .maybeSingle();
  const v = Array.isArray(invoice?.visits) ? invoice?.visits[0] : invoice?.visits;
  if (!invoice || v?.patient_id !== payload.patient_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = new Date();
  await sb.from("payment_claims").insert({
    id: crypto.randomUUID(),
    invoice_id: invoiceId,
    claimed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    source_ip: req.headers.get("x-forwarded-for"),
  });

  return NextResponse.json({ ok: true });
}
