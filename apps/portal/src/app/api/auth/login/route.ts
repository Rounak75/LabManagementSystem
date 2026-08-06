import { NextRequest, NextResponse } from "next/server";
import {
  tryLogin,
  tryPasswordLogin,
  tryBookingIdLogin,
  tryPatientIdLogin,
} from "@portal/lib/auth";
import { apiError } from "@portal/lib/api-error";
import { verifyPuzzle } from "@portal/lib/captcha";
import {
  captchaRequired,
  clearFailuresForOrigin,
  clientIpKey,
  recentFailuresForOrigin,
  recordFailureForOrigin,
} from "@portal/lib/login-throttle";

export const runtime = "nodejs"; // bcrypt requires Node runtime

const COOKIE_NAME = "portal_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(req: NextRequest) {
  let body: {
    phone?: string;
    code?: string;
    password?: string;
    /**
     * Whichever id the lab gave this patient: `LAB-…` spoken at the counter, or
     * `BKG-…` emailed with a home-collection confirmation. One field rather than
     * two, because a patient holding one id should not have to work out which
     * kind it is before they can type it.
     */
    firstTimeId?: string;
    patientId?: string;
    next?: string;
    captchaToken?: string;
    captchaAnswer?: number;
  };
  try { body = await req.json(); } catch {
    return apiError("bad_json", 400);
  }

  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (phone.length !== 10) return apiError("invalid_phone", 400);

  // Account lockout handles guessing at one patient. This handles one guess
  // against each of thousands of phone numbers, which never trips any single
  // account's counter and also reveals which numbers are registered patients.
  // The answer is a puzzle rather than a block: a clinic behind one NAT address
  // is many legitimate patients.
  const ipKey = clientIpKey(req.headers, process.env.SUPABASE_JWT_SECRET ?? "");
  if (ipKey && captchaRequired(await recentFailuresForOrigin(ipKey))) {
    const solved = await verifyPuzzle(
      String(body.captchaToken ?? ""),
      Number(body.captchaAnswer),
    );
    if (!solved) {
      return NextResponse.json(
        {
          error: {
            code: "captcha_required",
            message: "Please answer the question below to continue.",
          },
          captchaRequired: true,
        },
        { status: 400 },
      );
    }
  }

  // Both first-time ids name exactly one patient, so neither can raise the
  // shared-phone chooser the other two paths need.
  const firstTimeId = String(body.firstTimeId ?? "").trim().toUpperCase();

  const result = firstTimeId
    ? firstTimeId.startsWith("BKG")
      ? // Booked online: never been to the lab, so no report and no access code
        // has ever been printed for them.
        await tryBookingIdLogin(phone, firstTimeId)
      : // Walked in: the report carrying their access code is not printed until
        // the very end of the visit, so this is their only way in before then.
        await tryPatientIdLogin(phone, firstTimeId)
    : body.password
    ? // patientId matters here too: households share a phone number, and without
      // it the password path could only ever return the chooser.
      await tryPasswordLogin(phone, String(body.password), body.patientId)
    : await tryLogin({ phone, code: String(body.code ?? ""), patientId: body.patientId });

  // "needs_chooser" is not a failed attempt — the phone is right and the patient
  // has only been asked which household member they are.
  const failed = result.kind === "no_patient" || result.kind === "invalid_code";
  if (ipKey && failed) await recordFailureForOrigin(ipKey);

  if (result.kind === "no_patient") return apiError("no_patient_found", 401);
  if (result.kind === "invalid_code") return apiError("invalid_code", 401);
  // The booking is real and the details are right — the lab simply has not
  // turned it into a visit yet. Answering "invalid" here would send the patient
  // hunting for a mistake they did not make.
  if (result.kind === "booking_not_ready") {
    return NextResponse.json(
      {
        error: {
          code: "booking_not_ready",
          message:
            "Your booking is confirmed, but the lab has not opened your visit yet. " +
            "Please try again a little later.",
        },
      },
      { status: 409 },
    );
  }
  if (result.kind === "locked") return NextResponse.json({ error: { code: "account_locked", message: "Your account is temporarily locked. Please try again later." }, until: result.until }, { status: 423 });
  if (result.kind === "needs_chooser") return NextResponse.json({ needsChooser: true, patients: result.patients });

  // Someone who mistyped twice and then got in should not still be challenged.
  if (ipKey) await clearFailuresForOrigin(ipKey);

  // A booking id is `BKG-YYYY-NNNNN` — anyone can count through it, and unlike an
  // access code it never expires. It buys exactly one trip to the password page;
  // `next` is deliberately ignored, since honouring it would leave that
  // credential live for as long as the patient kept using it.
  const res = NextResponse.json({
    ok: true,
    mustSetPassword: result.mustSetPassword === true,
    redirectTo: result.mustSetPassword
      ? "/account/password?first=1"
      : (body.next ?? "/dashboard"),
  });
  res.cookies.set(COOKIE_NAME, result.jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
