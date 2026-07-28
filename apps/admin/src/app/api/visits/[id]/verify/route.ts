import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = getServerSupabase(user.token);

  // One call so the visit, its tests and its results reach the verified end state
  // together. This used to be separate writes that stopped short of locking:
  // visit_tests.is_locked was never set — the column the patient portal's report
  // gate reads and the locked-result trigger keys off — so a verified visit still
  // told the patient their report was being checked, and a signed-off result
  // stayed editable. The visit was also left in status 'Verified', which nothing
  // reads; the desktop, the Completed tab and the patient dashboard all look for
  // 'Completed'.
  const { error } = await sb.rpc("verify_visits", {
    p_visit_ids: [params.id],
    p_user_id: user.id,
  });
  if (error) {
    if (error.code === "42501" || /not authorised/i.test(error.message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "visit.verify",
    target_entity: "visits",
    target_id: params.id,
    details: "{}",
  });

  revalidateTag(CACHE_TAGS.visits);
  return NextResponse.json({ ok: true });
}
