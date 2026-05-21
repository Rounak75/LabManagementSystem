import { NextRequest, NextResponse } from "next/server";
import { tryLogin, tryPasswordLogin } from "@portal/lib/auth";
import { apiError } from "@portal/lib/api-error";

export const runtime = "nodejs"; // bcrypt requires Node runtime

const COOKIE_NAME = "portal_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string; password?: string; patientId?: string; next?: string };
  try { body = await req.json(); } catch {
    return apiError("bad_json", 400);
  }

  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (phone.length !== 10) return apiError("invalid_phone", 400);

  const result = body.password
    ? await tryPasswordLogin(phone, String(body.password))
    : await tryLogin({ phone, code: String(body.code ?? ""), patientId: body.patientId });

  if (result.kind === "no_patient") return apiError("no_patient_found", 401);
  if (result.kind === "invalid_code") return apiError("invalid_code", 401);
  if (result.kind === "locked") return NextResponse.json({ error: { code: "account_locked", message: "Your account is temporarily locked. Please try again later." }, until: result.until }, { status: 423 });
  if (result.kind === "needs_chooser") return NextResponse.json({ needsChooser: true, patients: result.patients });

  const res = NextResponse.json({ ok: true, redirectTo: body.next ?? "/dashboard" });
  res.cookies.set(COOKIE_NAME, result.jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
