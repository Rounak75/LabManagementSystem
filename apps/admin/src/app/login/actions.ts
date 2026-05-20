"use server";
import { redirect } from "next/navigation";
import { callAuthLogin } from "@/lib/edge-function";
import { setSessionCookie, verifyJWT } from "@/lib/auth-session";

export async function loginAction(formData: FormData): Promise<{ error?: string } | void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Please enter username and password." };

  try {
    const r = await callAuthLogin(username, password);
    const payload = await verifyJWT(r.token);
    await setSessionCookie(r.token, payload.exp);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INVALID_CREDENTIALS") return { error: "Wrong username or password." };
    if (msg === "LOCKED_OUT") return { error: "Too many attempts. Try again in 15 minutes." };
    return { error: "Login service unavailable. Please try again." };
  }
  redirect("/dashboard");
}
