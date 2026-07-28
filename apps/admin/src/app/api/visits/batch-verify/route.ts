import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function POST(req: Request) {
  const userPromise = getSessionUser();
  const bodyPromise = req.json();
  const user = await userPromise;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { ids } = await bodyPromise;
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

  // Same end state as the single-visit verify, for the same reason: stopping at
  // visits.status left every test unlocked, so the patient portal went on telling
  // these patients their reports were still being checked and their signed-off
  // results stayed editable.
  const { error: verifyErr } = await sb.rpc("verify_visits", {
    p_visit_ids: safeIds,
    p_user_id: user.id,
  });
  if (verifyErr) {
    if (verifyErr.code === "42501" || /not authorised/i.test(verifyErr.message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: verifyErr.message }, { status: 500 });
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
