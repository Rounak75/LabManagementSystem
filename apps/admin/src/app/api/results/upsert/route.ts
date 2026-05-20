import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { upsertResult } from "@/lib/result-write";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const sb = getServerSupabase(user.token);
  try {
    const id = await upsertResult(sb, user.id, body);
    return NextResponse.json({ id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
