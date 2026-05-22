import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import { NavLinks } from "./NavLinks";
import type { SessionUser } from "@/lib/auth-session";

export function NavBar({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex h-14 items-center justify-between gap-3">
          <Link href="/dashboard" prefetch className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 9.5V3" />
                <path d="M8 3h8M8 13h8" />
              </svg>
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-slate-900">Lab Admin</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-slate-600 sm:inline">{user.username}</span>
            <SignOutButton />
          </div>
        </div>
        <div className="overflow-x-auto pb-2">
          <NavLinks isAdmin={user.role === "Admin"} />
        </div>
      </div>
    </header>
  );
}
