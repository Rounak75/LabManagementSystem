import type { SessionUser } from "@lab/types";
import { domainError } from "@shared/domain-error";

let current: SessionUser | null = null;

export function setSession(u: SessionUser | null) { current = u; }
export function getSession(): SessionUser | null { return current; }
export function requireSession(): SessionUser {
  if (!current) throw domainError("UNAUTHENTICATED");
  return current;
}
export function requireAdmin(): SessionUser {
  const u = requireSession();
  if (u.role !== "Admin") throw domainError("FORBIDDEN");
  return u;
}
