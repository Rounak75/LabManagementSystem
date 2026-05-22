"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/patients", label: "Patients" },
  { href: "/visits", label: "Visits" },
  { href: "/payments", label: "Payments" },
  { href: "/bookings", label: "Bookings" },
  { href: "/audit", label: "Audit", adminOnly: true },
  { href: "/settings", label: "Settings" },
];

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto sm:mx-0">
      {LINKS.filter((l) => !l.adminOnly || isAdmin).map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
