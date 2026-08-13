// Phase 3d Plan F — issue a math captcha puzzle for the public /book form.
// Always fresh; never cached.

import { NextResponse } from "next/server";
import { issuePuzzle } from "@portal/lib/captcha";
import { enforceMemoryRateLimit } from "@portal/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Anonymous, uncacheable by design, and therefore one billed invocation per
  // call with nothing standing in front of it. Nothing is written and no secret
  // is reachable, so the only thing being spent is the free tier's invocation
  // budget — which is exactly why the counter is in memory rather than in the
  // database. Paying a Supabase round trip to protect against a wasted
  // invocation would make each abusive request cost more, not less.
  const limited = enforceMemoryRateLimit("captcha", req.headers);
  if (limited) return limited;

  const p = await issuePuzzle();
  return NextResponse.json(p);
}
