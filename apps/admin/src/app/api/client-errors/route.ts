import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { withinLimit } from "@/lib/rate-limit";

/**
 * Twenty reports a minute from one staff member.
 *
 * A person clicking around generates a handful an hour at worst. This number is
 * aimed at the other case: a component throwing on every render with the error
 * reporter wired into it, which posts a row per render for as long as the tab is
 * open and fills the table overnight.
 */
const LIMIT = { windowSeconds: 60, max: 20 };

export async function POST(req: Request) {
  const user = await getSessionUser();
  const body = await req.json().catch(() => ({}));
  if (!user) return NextResponse.json({ ok: false }); // anonymous → drop

  // Silently dropped rather than answered with a 429: the caller is an error
  // reporter, and telling it that its error report failed invites it to report
  // that failure too.
  if (!withinLimit(`client-errors:${user.id}`, LIMIT)) return NextResponse.json({ ok: true });

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
