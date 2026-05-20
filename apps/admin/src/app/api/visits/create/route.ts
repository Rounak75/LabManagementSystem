import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { visitCreateSchema } from "@lab/types";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = visitCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sb = getServerSupabase(user.token);

  // 1. Insert the visit. type/staff_id/status match the desktop Visit model
  // (status uses the "Open" enum, not "InProgress").
  const visitId = crypto.randomUUID();
  const { error: vErr } = await sb.from("visits").insert({
    id: visitId,
    visit_id: parsed.data.allocatedVisitId,
    patient_id: parsed.data.patientId,
    visit_date: parsed.data.visitDate,
    type: "WalkIn",
    staff_id: user.id,
    status: "Open",
    source: "admin",
  });
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  // 2. Insert visit_tests children.
  const vtRows = parsed.data.testIds.map((tid) => ({
    id: crypto.randomUUID(),
    visit_id: visitId,
    test_id: tid,
    status: "Collected",
  }));
  const { error: vtErr } = await sb.from("visit_tests").insert(vtRows);
  if (vtErr) return NextResponse.json({ error: vtErr.message }, { status: 500 });

  // 3. Best-effort audit trail.
  await sb
    .from("audit_logs")
    .insert({
      user_id: user.id,
      action: "visit.create",
      target_entity: "visits",
      target_id: visitId,
      details: JSON.stringify({ visit_id: parsed.data.allocatedVisitId, test_count: parsed.data.testIds.length }),
    })
    .then(undefined, () => {});

  revalidateTag(CACHE_TAGS.visits);
  return NextResponse.json({ id: visitId });
}
