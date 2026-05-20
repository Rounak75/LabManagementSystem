import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "no ids" }, { status: 400 });
  }

  const sb = getServerSupabase(user.token);
  const now = new Date().toISOString();

  // Map visit_tests → visit so we can exclude any visit with an abnormal result.
  const { data: vts, error: vtErr } = await sb
    .from("visit_tests")
    .select("id, visit_id")
    .in("visit_id", ids);
  if (vtErr) return NextResponse.json({ error: vtErr.message }, { status: 500 });
  const vtToVisit = new Map<string, string>();
  for (const vt of vts ?? []) vtToVisit.set(vt.id, vt.visit_id);

  const visitsWithAbnormal = new Set<string>();
  const vtIds = (vts ?? []).map((vt) => vt.id);
  if (vtIds.length > 0) {
    const { data: abn, error: abnErr } = await sb
      .from("results")
      .select("visit_test_id")
      .eq("is_abnormal", true)
      .in("visit_test_id", vtIds);
    if (abnErr) return NextResponse.json({ error: abnErr.message }, { status: 500 });
    for (const r of abn ?? []) {
      const v = vtToVisit.get(r.visit_test_id);
      if (v) visitsWithAbnormal.add(v);
    }
  }

  const safeIds = (ids as string[]).filter((id) => !visitsWithAbnormal.has(id));
  const skipped = ids.length - safeIds.length;
  if (safeIds.length === 0) {
    return NextResponse.json({ ok: true, count: 0, skipped });
  }

  const { error } = await sb
    .from("visits")
    .update({ status: "Verified", verified_at: now, verified_by_user_id: user.id, updated_at: now })
    .in("id", safeIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const safeVtIds = (vts ?? []).filter((vt) => safeIds.includes(vt.visit_id)).map((vt) => vt.id);
  if (safeVtIds.length > 0) {
    await sb.from("results").update({ verified_at: now }).in("visit_test_id", safeVtIds);
  }

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "visit.batch_verify",
    target_entity: "visits",
    target_id: safeIds.join(","),
    details: JSON.stringify({ count: safeIds.length, skipped, batch: true }),
  });

  revalidateTag(CACHE_TAGS.visits);
  return NextResponse.json({ ok: true, count: safeIds.length, skipped });
}
