// Release a verified report to the patient even though the bill is unpaid.
//
// The portal withholds the PDF while money is owed. That is right for a walk-in
// and wrong for a regular the lab has always extended credit to, or a patient who
// paid in a way the system has not caught up with. Without this the staff's only
// options would be to record a payment that never happened — which corrupts the
// day's takings — or to tell the patient their report does not exist.
//
// Admin-only, and audit-logged with a reason: it is a decision about money that
// someone may have to answer for later.

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Waiving a bill is the owner's call, not the front desk's.
  if (user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const params = await paramsPromise;
  const body = await req.json().catch(() => ({}));
  const release = body?.release !== false; // default: release
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;

  const sb = getServerSupabase(user.token);
  const now = new Date().toISOString();

  const { error } = await sb
    .from("visits")
    .update({
      report_release_override: release,
      report_release_override_by_user_id: release ? user.id : null,
      report_release_override_at: release ? now : null,
      report_release_override_reason: release ? reason : null,
      updated_at: now,
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  sb.from("audit_logs")
    .insert({
      user_id: user.id,
      action: release ? "visit.report_release_override" : "visit.report_release_override_revoked",
      target_entity: "visits",
      target_id: params.id,
      details: JSON.stringify({ reason }),
    })
    .then(undefined, () => {});

  revalidateTag(CACHE_TAGS.visits);
  return NextResponse.json({ ok: true, released: release });
}
