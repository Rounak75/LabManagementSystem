import type { SessionUser } from "@lab/types";

let current: SessionUser | null = null;

export function setSession(u: SessionUser | null) { current = u; }
export function getSession(): SessionUser | null { return current; }
export function requireSession(): SessionUser {
  if (!current) throw new Error("UNAUTHENTICATED");
  return current;
}
export function requireAdmin(): SessionUser {
  const u = requireSession();
  if (u.role !== "Admin") throw new Error("FORBIDDEN");
  return u;
}
