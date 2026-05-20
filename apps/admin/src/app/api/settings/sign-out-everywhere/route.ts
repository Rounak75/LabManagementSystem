import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser, clearSessionCookie } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";

// Bumps the user's session_epoch so every token minted before now is rejected
// (see getSessionUser), then clears this device's cookie too.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);
  const sb = getServerSupabase(user.token);
  await sb.from("users").update({ session_epoch: Date.now() }).eq("id", user.id);
  revalidateTag(CACHE_TAGS.sessionEpoch);
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
