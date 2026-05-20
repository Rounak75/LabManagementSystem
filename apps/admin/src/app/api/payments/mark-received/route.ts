import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.invoice_id || !body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const sb = getServerSupabase(user.token);
  const now = new Date().toISOString();

  const { data: inv, error: invErr } = await sb
    .from("invoices")
    .select("id, visit_id, total, amount_paid, payment_status")
    .eq("id", body.invoice_id)
    .single();
  if (invErr || !inv) return NextResponse.json({ error: "invoice not found" }, { status: 404 });

  const newPaid = Number(inv.amount_paid) + Number(body.amount);
  const newStatus = newPaid >= Number(inv.total) ? "Paid" : "Partial";

  const { error: pErr } = await sb.from("payments").insert({
    id: crypto.randomUUID(),
    invoice_id: body.invoice_id,
    amount: body.amount,
    method: "UPI_Direct",
    reference: body.reference ?? null,
    received_by_user_id: user.id,
    received_at: now,
    source: "admin",
    created_at: now,
    updated_at: now,
  });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { error: uErr } = await sb
    .from("invoices")
    .update({ amount_paid: newPaid, payment_status: newStatus, updated_at: now })
    .eq("id", body.invoice_id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "payment.mark_received",
    target_entity: "invoices",
    target_id: body.invoice_id,
    details: JSON.stringify({ amount: body.amount, reference: body.reference, new_status: newStatus }),
  });

  return NextResponse.json({ ok: true, payment_status: newStatus });
}
