// Session enforcement and the CSP nonce, for every staff-facing page.
//
// This file used to live at the package root, one directory up. Next looks for
// middleware beside `app/` — which in this project means inside `src/` — so at
// the root it was never loaded: no error, no warning, a build that succeeded and
// a middleware that had simply never run. The `(authed)` layout calls
// `getSessionUser()` and every API route checks for itself, so nothing was
// reachable that should not have been; what was missing was the outer layer
// meant to catch the page that one day forgets. The portal had the identical bug
// and carries the identical note.
//
// Two jobs, on two different scopes:
//
//  1. The session check, on the eight route groups under `app/(authed)` — the
//     same eight the old matcher named, so reviving this adds a layer without
//     changing where it applies.
//  2. The CSP nonce, on every page. Including `/login`, which is not authed and
//     is precisely the page where a staff password is typed.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { assertStaffClaims } from "@/lib/jwt-claims";
import { buildCsp, generateNonce } from "@/lib/security-headers";

const COOKIE_NAME = "admin_session";

/** The route groups under `app/(authed)`. */
const AUTHED_PREFIXES = [
  "/dashboard",
  "/account",
  "/patients",
  "/visits",
  "/payments",
  "/bookings",
  "/audit",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });

  // Next reads the nonce back off the *request* CSP header to stamp its own
  // hydration scripts. Setting it only on the response would leave those scripts
  // unsigned against a policy that forbids unsigned scripts — a blank page.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const withCsp = (res: NextResponse): NextResponse => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const proceed = () =>
    withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  const toLogin = () => withCsp(NextResponse.redirect(new URL("/login", req.url)));

  const needsAuth = AUTHED_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!needsAuth) return proceed();

  const c = req.cookies.get(COOKIE_NAME);
  if (!c?.value) return toLogin();

  try {
    const { token, expiresAt } = JSON.parse(Buffer.from(c.value, "base64url").toString("utf-8"));
    if (expiresAt < Date.now()) throw new Error("expired");
    const key = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const { payload } = await jwtVerify(token, key);
    // A valid signature only proves the token came from this deployment — the
    // patient portal signs with the same secret. Require the staff claims too.
    assertStaffClaims(payload as Record<string, unknown>);
    return proceed();
  } catch {
    return toLogin();
  }
}

export const config = {
  matcher: [
    // Every page, and deliberately not `/api/*`: a JSON response has no scripts
    // in it, so a CSP buys nothing there, while the static headers in
    // `next.config.mjs` do cover it. Static assets are excluded because they are
    // served from the CDN and running middleware on them is pure latency.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
