import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getServerSupabase(user.token);

  const { error } = await sb
    .from("visits")
    .update({ status: "PendingVerify", updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "visit.mark_pending_verify",
    target_entity: "visits",
    target_id: params.id,
    details: "{}",
  });

  revalidateTag(CACHE_TAGS.visits);
  return NextResponse.json({ ok: true });
}
