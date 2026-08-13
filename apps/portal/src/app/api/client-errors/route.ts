import { NextResponse } from "next/server";
import { enforceMemoryRateLimit } from "@portal/lib/rate-limit";

export const runtime = "nodejs";

// Anonymous client-error sink: log server-side (visible in function logs) for
// diagnostics, store nothing. Never echoes input back to the client.
export async function POST(req: Request) {
  // Anonymous and write-shaped: it appends to the function logs, which are a
  // metered resource and the place a real incident has to be legible in. An
  // unbounded anonymous writer can bury a genuine error under a million forged
  // ones, which costs nothing to do and makes the log useless exactly when it
  // is needed. In memory rather than the database for the same reason as
  // /api/captcha — nothing is persisted, so the only cost is the invocation.
  const limited = enforceMemoryRateLimit("clientErrors", req.headers);
  if (limited) return limited;

  try {
    const body = await req.json();
    console.error("[portal client-error]", JSON.stringify({ message: body?.message, url: body?.url }).slice(0, 2000));
  } catch {
    /* ignore malformed reports */
  }
  return NextResponse.json({ ok: true });
}
