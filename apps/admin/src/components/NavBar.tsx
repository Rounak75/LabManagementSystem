import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import type { SessionUser } from "@/lib/auth-session";

export function NavBar({ user }: { user: SessionUser }) {
  return (
    <nav className="bg-white border-b">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">Lab Admin</Link>
          <Link href="/patients">Patients</Link>
          <Link href="/visits">Visits</Link>
          <Link href="/payments">Payments</Link>
          <Link href="/bookings">Bookings</Link>
          {user.role === "Admin" && <Link href="/audit">Audit</Link>}
          <Link href="/settings">Settings</Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.username}</span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
