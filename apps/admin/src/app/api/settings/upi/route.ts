import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const sb = getServerSupabase(user.token);
  const { error } = await sb
    .from("lab_settings")
    .update({
      lab_upi_vpa: body.lab_upi_vpa ?? null,
      lab_upi_payee_name: body.lab_upi_payee_name ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "singleton");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "settings.update_upi",
    target_entity: "lab_settings",
    target_id: "singleton",
    details: JSON.stringify({ vpa: body.lab_upi_vpa }),
  });

  return NextResponse.json({ ok: true });
}
