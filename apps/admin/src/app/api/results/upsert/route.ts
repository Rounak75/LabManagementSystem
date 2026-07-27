import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { upsertResult, ResultLockedError } from "@/lib/result-write";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const sb = getServerSupabase(user.token);
  try {
    const id = await upsertResult(sb, user.id, body);
    revalidateTag(CACHE_TAGS.visits);
    return NextResponse.json({ id });
  } catch (e: unknown) {
    // 409, not 500: the request was well-formed but the result is signed off.
    // A distinct status lets the UI tell the user to ask an Admin to unlock,
    // instead of showing a generic failure they cannot act on.
    if (e instanceof ResultLockedError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
