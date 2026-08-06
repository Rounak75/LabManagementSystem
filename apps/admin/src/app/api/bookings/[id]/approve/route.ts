import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { assigned_to_user_id, phone_confirm_outcome } = await req.json();

  // Approving writes this booking's phone onto a real Patient, where it becomes
  // that patient's portal login. A wrong digit locks the real patient out for
  // good and hands their record to whoever owns the number that was typed.
  //
  // The desktop has refused to approve without this since 6ad9e4f — but staff
  // approve from their phones, here, and this route asked nothing and stored
  // null. The guard existed only on the path nobody uses. Null keeps meaning
  // "never asked", which is why it cannot be the default for a fresh approval.
  if (phone_confirm_outcome !== "Reached" && phone_confirm_outcome !== "NoAnswer") {
    return NextResponse.json(
      {
        error: "phone_confirm_required",
        message: "Record what the confirmation call found before approving.",
      },
      { status: 400 },
    );
  }

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
      phone_confirm_outcome,
      phone_confirmed_at: now,
      phone_confirmed_by_id: user.id,
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

  revalidateTag(CACHE_TAGS.bookings);
  return NextResponse.json({ ok: true });
}
