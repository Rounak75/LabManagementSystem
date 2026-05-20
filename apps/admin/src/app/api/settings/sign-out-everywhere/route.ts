import { NextResponse } from "next/server";
import { getSessionUser, clearSessionCookie } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";

// Bumps the user's session_epoch so every token minted before now is rejected
// (see getSessionUser), then clears this device's cookie too.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);
  const sb = getServerSupabase(user.token);
  await sb.from("users").update({ session_epoch: Date.now() }).eq("id", user.id);
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
