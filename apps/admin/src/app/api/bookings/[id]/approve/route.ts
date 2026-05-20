import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { assigned_to_user_id } = await req.json();
  const sb = getServerSupabase(user.token);
  const now = new Date().toISOString();

  // pull-bookings reconciles by `version`; bump it so the desktop accepts the change.
  const { data: cur } = await sb.from("bookings").select("version").eq("id", params.id).single();
  const { error } = await sb
    .from("bookings")
    .update({
      status: "Approved",
      approved_by_user_id: user.id,
      approved_at: now,
      assigned_to_user_id: assigned_to_user_id ?? null,
      version: (cur?.version ?? 0) + 1,
      updated_at: now,
    })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "booking.approve",
    target_entity: "bookings",
    target_id: params.id,
    details: JSON.stringify({ assigned_to: assigned_to_user_id ?? null }),
  });

  return NextResponse.json({ ok: true });
}
