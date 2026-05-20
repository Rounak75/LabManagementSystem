import { NextRequest, NextResponse } from "next/server";
import { tryLogin } from "@portal/lib/auth";

export const runtime = "nodejs";
const COOKIE_NAME = "portal_session";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const code = String(body.code ?? "");
  const patientId = String(body.patientId ?? "");
  if (!phone || !code || !patientId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await tryLogin({ phone, code, patientId });
  if (result.kind === "success") {
    const res = NextResponse.json({ ok: true, redirectTo: "/dashboard" });
    res.cookies.set(COOKIE_NAME, result.jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
    return res;
  }
  if (result.kind === "locked") {
    return NextResponse.json({ error: "account_locked", until: result.until }, { status: 423 });
  }
  return NextResponse.json({ error: "invalid_code" }, { status: 401 });
}
