import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ userId: user.id, oldPassword: body.oldPassword, newPassword: body.newPassword }),
  });
  return new NextResponse(await r.text(), { status: r.status });
}
