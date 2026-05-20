import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

// A payment claim is a soft "I already paid" signal with no amount, so resolving
// it just records that a human handled it — it does NOT create a payment. The
// actual payment is recorded via /api/payments/mark-received.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { status } = await req.json();
  if (status !== "Confirmed" && status !== "Dismissed") {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  const sb = getServerSupabase(user.token);

  const { error } = await sb
    .from("payment_claims")
    .update({ status, resolved_by_user_id: user.id, resolved_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: `claim.${status.toLowerCase()}`,
    target_entity: "payment_claims",
    target_id: params.id,
    details: "{}",
  });

  revalidateTag(CACHE_TAGS.payments);
  return NextResponse.json({ ok: true });
}
