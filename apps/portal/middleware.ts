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
