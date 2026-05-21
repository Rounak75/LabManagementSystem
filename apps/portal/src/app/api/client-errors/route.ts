import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Anonymous client-error sink: log server-side (visible in function logs) for
// diagnostics, store nothing. Never echoes input back to the client.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.error("[portal client-error]", JSON.stringify({ message: body?.message, url: body?.url }).slice(0, 2000));
  } catch {
    /* ignore malformed reports */
  }
  return NextResponse.json({ ok: true });
}
