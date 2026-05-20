import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const sb = getServerSupabase(user.token);

  const { error } = await sb
    .from("visits")
    .update({
      status: "ReturnedForReview",
      return_reason: body.reason ?? null,
      return_note: body.note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "visit.send_back",
    target_entity: "visits",
    target_id: params.id,
    details: JSON.stringify({ reason: body.reason }),
  });

  return NextResponse.json({ ok: true });
}
