import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

interface RecordedPayment {
  payment_id: string;
  amount_paid: number;
  payment_status: string;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.invoice_id || !body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const sb = getServerSupabase(user.token);

  // One atomic call. This previously read `amount_paid`, added the payment in
  // JavaScript and wrote the total back, so two staff recording payments against
  // the same invoice at the same time both started from the same figure: one
  // payment disappeared from the invoice while its `payments` row survived, and
  // the patient could be chased for money they had already paid. The database now
  // locks the invoice, appends the payment and recomputes the balance together.
  const { data, error } = await sb.rpc("record_invoice_payment", {
    p_invoice_id: body.invoice_id,
    p_amount: body.amount,
    p_method: "UPI_Direct",
    p_reference: body.reference ?? null,
    p_received_by: user.id,
  });

  if (error) {
    // P0002 = no_data_found, raised when the invoice does not exist.
    const status = error.code === "P0002" || /invoice not found/i.test(error.message) ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const recorded = (Array.isArray(data) ? data[0] : data) as RecordedPayment | undefined;
  if (!recorded) {
    return NextResponse.json({ error: "payment not recorded" }, { status: 500 });
  }

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "payment.mark_received",
    target_entity: "invoices",
    target_id: body.invoice_id,
    details: JSON.stringify({
      amount: body.amount,
      reference: body.reference,
      new_status: recorded.payment_status,
      payment_id: recorded.payment_id,
    }),
  });

  revalidateTag(CACHE_TAGS.payments);
  return NextResponse.json({
    ok: true,
    payment_status: recorded.payment_status,
    amount_paid: recorded.amount_paid,
  });
}
