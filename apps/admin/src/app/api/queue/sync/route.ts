import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { upsertResult, ResultLockedError, VersionConflictError } from "@/lib/result-write";

// Flush endpoint for offline-queued result.upsert items. The body is the queue
// item's `body` field — the same shape /api/results/upsert accepts.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const sb = getServerSupabase(user.token);
  try {
    const { id, version } = await upsertResult(sb, user.id, body);
    revalidateTag(CACHE_TAGS.visits);
    return NextResponse.json({ id, version });
  } catch (e: unknown) {
    // A queued edit can arrive after the test was verified and locked. That is a
    // permanent outcome, not a transient failure: 409 tells the drain loop to
    // stop and show why, instead of leaving a generic 500 the user can't read.
    if (e instanceof ResultLockedError || e instanceof VersionConflictError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
