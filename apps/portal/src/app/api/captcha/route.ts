// Phase 3d Plan F — issue a math captcha puzzle for the public /book form.
// Always fresh; never cached.

import { NextResponse } from "next/server";
import { issuePuzzle } from "@portal/lib/captcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const p = await issuePuzzle();
  return NextResponse.json(p);
}
