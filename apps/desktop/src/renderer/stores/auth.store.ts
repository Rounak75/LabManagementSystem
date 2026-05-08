import { create } from "zustand";
import type { SessionUser } from "@lab/types";
import { call } from "@/lib/api";

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  bootstrap: async () => {
    const u = await call<SessionUser | null>("auth:currentUser");
    set({ user: u ?? null, loading: false });
  },
  login: async (username, password) => {
    const u = await call<SessionUser>("auth:login", { username, password });
    set({ user: u });
  },
  logout: async () => {
    await call<boolean>("auth:logout");
    set({ user: null });
  }
}));
