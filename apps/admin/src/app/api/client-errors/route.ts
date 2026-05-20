import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

export async function POST(req: Request) {
  const user = await getSessionUser();
  const body = await req.json().catch(() => ({}));
  if (!user) return NextResponse.json({ ok: false }); // anonymous → drop
  const sb = getServerSupabase(user.token);
  await sb.from("client_errors").insert({
    user_id: user.id,
    user_agent: body.userAgent ?? "",
    url: body.url ?? "",
    message: String(body.message ?? "").slice(0, 1000),
    stack: body.stack ?? null,
  });
  return NextResponse.json({ ok: true });
}
