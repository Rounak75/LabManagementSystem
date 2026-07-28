import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { visitCreateSchema } from "@lab/types";

interface CreatedVisit {
  visit_id: string;
  invoice_id: string;
  subtotal: number;
  amount_paid: number;
  payment_status: string;
}

export async function POST(req: Request) {
  const userPromise = getSessionUser();
  const bodyPromise = req.json();
  const user = await userPromise;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await bodyPromise;
  const parsed = visitCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sb = getServerSupabase(user.token);

  // The visit, its tests and its invoice are created in one database function so
  // they commit or vanish together. Previously the visit and visit_tests were
  // separate inserts (a failure on the second left a visit with no tests) and no
  // invoice was written at all — so a patient registered from a phone never
  // appeared in /payments, never got a Pay button on the portal, and never
  // counted towards the dashboard's money totals.
  const visitId = crypto.randomUUID();
  const { data, error } = await sb.rpc("create_visit_with_invoice", {
    p_id: visitId,
    p_visit_code: parsed.data.allocatedVisitId,
    p_patient_id: parsed.data.patientId,
    p_visit_date: parsed.data.visitDate,
    p_staff_id: user.id,
    p_test_ids: parsed.data.testIds,
    p_amount_paid: parsed.data.amountPaid ?? 0,
    p_payment_method: parsed.data.paymentMethod ?? null,
    p_received_by: user.id,
  });

  if (error) {
    // The function raises for a tampered or stale request (unknown test, payment
    // above the total, no tests). Those are the caller's fault, not a server
    // fault, so they come back as 400 with the reason the staff member can act on.
    const isCallerError =
      error.code === "23514" || // check_violation
      error.code === "23503" || // foreign_key_violation
      /must be positive|cannot be negative|exceeds the visit total|do not exist|needs at least one test/i.test(
        error.message,
      );
    if (error.code === "42501" || /not authorised/i.test(error.message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: isCallerError ? 400 : 500 });
  }

  const created = (Array.isArray(data) ? data[0] : data) as CreatedVisit | undefined;

  // Best-effort audit trail.
  sb.from("audit_logs")
    .insert({
      user_id: user.id,
      action: "visit.create",
      target_entity: "visits",
      target_id: visitId,
      details: JSON.stringify({
        visit_id: parsed.data.allocatedVisitId,
        test_count: parsed.data.testIds.length,
        subtotal: created?.subtotal,
        amount_paid: created?.amount_paid,
        payment_method: parsed.data.paymentMethod ?? null,
      }),
    })
    .then(undefined, () => {});

  revalidateTag(CACHE_TAGS.visits);
  revalidateTag(CACHE_TAGS.payments);
  return NextResponse.json({
    id: visitId,
    invoiceId: created?.invoice_id,
    subtotal: created?.subtotal,
    amountPaid: created?.amount_paid,
    paymentStatus: created?.payment_status,
  });
}
