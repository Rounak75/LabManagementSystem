import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import type { SessionUser } from "@/lib/auth-session";

export function NavBar({ user }: { user: SessionUser }) {
  return (
    <nav className="bg-white border-b">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* prefetch forces a full prefetch (incl. data) of these dynamic routes;
              their reads are cached server-side, so navigation lands instantly. */}
          <Link href="/dashboard" prefetch className="font-semibold">Lab Admin</Link>
          <Link href="/patients" prefetch>Patients</Link>
          <Link href="/visits" prefetch>Visits</Link>
          <Link href="/payments" prefetch>Payments</Link>
          <Link href="/bookings" prefetch>Bookings</Link>
          {user.role === "Admin" && <Link href="/audit" prefetch>Audit</Link>}
          <Link href="/settings" prefetch>Settings</Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.username}</span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
