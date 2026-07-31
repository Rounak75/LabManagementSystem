// This file must sit beside `app/`, which in this project means inside `src/`.
// At the package root it is silently ignored — Next reports nothing, the build
// succeeds, and every authed page is left defended only by its own
// `requirePatient()` call. The pages that read patient data all make that call,
// so nothing leaked; what was lost was the layer meant to catch the page that
// one day forgets, and the `?next=` return path after signing in.

import { NextRequest, NextResponse } from "next/server";

const AUTHED_PREFIXES = ["/dashboard", "/visits", "/invoices", "/account"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = AUTHED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const cookie = req.cookies.get("portal_session")?.value;
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/visits/:path*", "/invoices/:path*", "/account/:path*"],
};
