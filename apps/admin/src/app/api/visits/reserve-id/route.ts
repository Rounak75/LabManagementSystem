import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { callReserveVisitId } from "@/lib/edge-function";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await callReserveVisitId(user.token, "VIS", new Date().getUTCFullYear(), user.id);
    return NextResponse.json(r);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
