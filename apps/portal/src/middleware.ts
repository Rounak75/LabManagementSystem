// This file must sit beside `app/`, which in this project means inside `src/`.
// At the package root it is silently ignored — Next reports nothing, the build
// succeeds, and every authed page is left defended only by its own
// `requirePatient()` call. The pages that read patient data all make that call,
// so nothing leaked; what was lost was the layer meant to catch the page that
// one day forgets, and the `?next=` return path after signing in.

import { NextRequest, NextResponse } from "next/server";
import { verifyPatientJwt } from "@portal/lib/jwt";

const AUTHED_PREFIXES = ["/dashboard", "/visits", "/invoices", "/account"];

/** The one screen a half-finished session is allowed to reach. */
const PASSWORD_PATH = "/account/password";

function toLogin(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const needsAuth = AUTHED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const cookie = req.cookies.get("portal_session")?.value;
  if (!cookie) return toLogin(req, pathname);

  // Verified, not merely counted. A cookie that does not verify is not a
  // session, and treating any string as one was safe only for as long as every
  // page also called requirePatient() — which is the assumption this layer
  // exists to stop depending on.
  let payload;
  try {
    payload = await verifyPatientJwt(cookie);
  } catch {
    return toLogin(req, pathname);
  }

  // Signing in with a booking id or a patient id used to hand back an ordinary
  // 30-day session and merely redirect here, which the browser was free to
  // ignore — typing /dashboard walked straight past it. So an id that is
  // guessable by counting, and that never expires, stayed a working credential
  // for as long as the patient never got round to choosing a password. Holding
  // the session here is what makes "it buys exactly one trip to this page" true.
  if (payload.must_set_password && !pathname.startsWith(PASSWORD_PATH)) {
    const url = req.nextUrl.clone();
    url.pathname = PASSWORD_PATH;
    url.search = "";
    url.searchParams.set("first", "1");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/visits/:path*", "/invoices/:path*", "/account/:path*"],
};
