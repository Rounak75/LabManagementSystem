// This file must sit beside `app/`, which in this project means inside `src/`.
// At the package root it is silently ignored — Next reports nothing, the build
// succeeds, and every authed page is left defended only by its own
// `requirePatient()` call. The pages that read patient data all make that call,
// so nothing leaked; what was lost was the layer meant to catch the page that
// one day forgets, and the `?next=` return path after signing in.
//
// It now does two jobs, and they are independent:
//
//  1. Session enforcement, on the four authed prefixes only.
//  2. The Content-Security-Policy nonce, on every page.
//
// The second is why the matcher below covers the whole site rather than the
// authed prefixes it used to. A CSP that protected only the signed-in pages
// would leave /login and /book — the two pages that take a password and a phone
// number from someone who is not signed in yet — as the unprotected ones.

import { NextRequest, NextResponse } from "next/server";
import { verifyPatientJwt } from "@portal/lib/jwt";
import { buildCsp, generateNonce } from "@portal/lib/security-headers";

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
  const nonce = generateNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });

  // Next reads the nonce back off the *request* CSP header and stamps it onto
  // the scripts it emits. Setting it only on the response would produce a policy
  // that forbids Next's own hydration scripts — a blank page, on every route.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = req.nextUrl;
  const needsAuth = AUTHED_PREFIXES.some((p) => pathname.startsWith(p));

  /** Applies the policy to whatever we end up returning, redirects included. */
  const withCsp = (res: NextResponse): NextResponse => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const proceed = (): NextResponse =>
    withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  if (!needsAuth) return proceed();

  const cookie = req.cookies.get("portal_session")?.value;
  if (!cookie) return withCsp(toLogin(req, pathname));

  // Verified, not merely counted. A cookie that does not verify is not a
  // session, and treating any string as one was safe only for as long as every
  // page also called requirePatient() — which is the assumption this layer
  // exists to stop depending on.
  let payload;
  try {
    payload = await verifyPatientJwt(cookie);
  } catch {
    return withCsp(toLogin(req, pathname));
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
    return withCsp(NextResponse.redirect(url));
  }

  return proceed();
}

export const config = {
  matcher: [
    // Every page, and deliberately not `/api/*`: an API response is JSON with no
    // scripts in it, so a CSP buys nothing there, while the static headers in
    // `next.config.mjs` (nosniff and the rest) do cover it. Static assets and
    // the image optimiser are excluded because they are served straight from the
    // CDN and running middleware on them is pure latency.
    //
    // Next's own CSP example additionally excludes prefetch requests via a
    // `missing:` clause, to keep a prefetched document from carrying a nonce
    // that has since gone stale. Not copied here, and the omission is the point:
    // this middleware also enforces the session, and a prefetch that skips it is
    // a request for an authed page that nothing checked. The stale-nonce problem
    // it avoids does not arise for us — the only inline script is the theme
    // bootstrap in the root layout's `<head>`, which a client-side navigation
    // never re-renders.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
