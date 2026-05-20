import { NextRequest, NextResponse } from "next/server";
import { verifyPatientJwt } from "@portal/lib/jwt";
import { trySetPassword } from "@portal/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value;
  if (!cookie) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  try {
    const payload = await verifyPatientJwt(cookie);
    const body = await req.json();
    const newPassword = String(body.password ?? "");
    await trySetPassword(payload.patient_id, newPassword);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "PASSWORD_TOO_SHORT") {
      return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
