import { create } from "zustand";

export type ToastSeverity = "info" | "success" | "error" | "warn";
export type ToastItem = { id: number; severity: ToastSeverity; message: string; ttlMs: number };

type State = {
  items: ToastItem[];
  push: (severity: ToastSeverity, message: string, ttlMs?: number) => number;
  info: (m: string) => number;
  success: (m: string) => number;
  warn: (m: string) => number;
  error: (m: string) => number;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToast = create<State>((set, get) => ({
  items: [],
  push(severity, message, ttlMs = severity === "error" ? 0 : 5000) {
    const id = nextId++;
    set(s => ({ items: [...s.items, { id, severity, message, ttlMs }] }));
    if (ttlMs > 0) setTimeout(() => get().dismiss(id), ttlMs);
    return id;
  },
  info: m => get().push("info", m),
  success: m => get().push("success", m),
  warn: m => get().push("warn", m),
  error: m => get().push("error", m, 0),
  dismiss(id) { set(s => ({ items: s.items.filter(t => t.id !== id) })); }
}));
