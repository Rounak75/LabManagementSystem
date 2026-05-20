import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "admin_session";

export async function middleware(req: NextRequest) {
  const c = req.cookies.get(COOKIE_NAME);
  if (!c?.value) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const { token, expiresAt } = JSON.parse(Buffer.from(c.value, "base64url").toString("utf-8"));
    if (expiresAt < Date.now()) throw new Error("expired");
    const key = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    await jwtVerify(token, key);
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
