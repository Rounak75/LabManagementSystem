import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = getServerSupabase(user.token);
  const now = new Date().toISOString();

  const { error: vErr } = await sb
    .from("visits")
    .update({ status: "Verified", verified_at: now, verified_by_user_id: user.id, updated_at: now })
    .eq("id", params.id);
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  const { data: vts } = await sb.from("visit_tests").select("id").eq("visit_id", params.id);
  const vtIds = (vts ?? []).map((x) => x.id);
  if (vtIds.length > 0) {
    await sb.from("results").update({ verified_at: now }).in("visit_test_id", vtIds);
  }

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "visit.verify",
    target_entity: "visits",
    target_id: params.id,
    details: "{}",
  });

  return NextResponse.json({ ok: true });
}
