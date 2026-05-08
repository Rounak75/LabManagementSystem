import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/stores/auth.store";
import type { Role } from "@lab/types";

export function RequireRole({ role, children }: { role?: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
