import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { assertStaffClaims } from "@/lib/jwt-claims";

const COOKIE_NAME = "admin_session";

export async function middleware(req: NextRequest) {
  const c = req.cookies.get(COOKIE_NAME);
  if (!c?.value) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const { token, expiresAt } = JSON.parse(Buffer.from(c.value, "base64url").toString("utf-8"));
    if (expiresAt < Date.now()) throw new Error("expired");
    const key = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const { payload } = await jwtVerify(token, key);
    // A valid signature only proves the token came from this deployment — the
    // patient portal signs with the same secret. Require the staff claims too.
    assertStaffClaims(payload as Record<string, unknown>);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/account/:path*",
    "/patients/:path*",
    "/visits/:path*",
    "/payments/:path*",
    "/bookings/:path*",
    "/audit/:path*",
    "/settings/:path*",
  ],
};
