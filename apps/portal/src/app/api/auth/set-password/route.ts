import { NextRequest, NextResponse } from "next/server";
import { mintPatientJwt, verifyPatientJwt } from "@portal/lib/jwt";
import { trySetPassword } from "@portal/lib/auth";
import { COOKIE_NAME, setSessionCookie } from "@portal/lib/session-cookie";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  try {
    const payload = await verifyPatientJwt(cookie);
    const body = await req.json();
    const newPassword = String(body.password ?? "");
    await trySetPassword(payload.patient_id, newPassword);

    // Reissued without the must-set-password claim, which this call is what
    // clears. The patient arrived here on a token the middleware bounces off
    // every other page; handing back the same one would send them straight back
    // to this screen after finishing it, for as long as the session lasted.
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, await mintPatientJwt(payload.patient_id));
    return res;
  } catch (e) {
    if ((e as Error).message === "PASSWORD_TOO_SHORT") {
      return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
