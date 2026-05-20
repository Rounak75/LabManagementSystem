import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = getServerSupabase(user.token);

  const { data: v } = await sb.from("visits").select("verified_at").eq("id", params.id).single();
  if (!v?.verified_at) return NextResponse.json({ error: "not verified" }, { status: 400 });

  const { error } = await sb.from("print_jobs").insert({
    id: crypto.randomUUID(),
    visit_id: params.id,
    requested_by_id: user.id,
    status: "Queued",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "print.queue",
    target_entity: "visits",
    target_id: params.id,
    details: "{}",
  });

  return NextResponse.json({ ok: true });
}
