import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-bg/85 backdrop-blur-md border-b border-line">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand text-brand-fg font-heading font-bold text-[14px]"
          >
            GJ
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-text text-[14.5px] font-heading font-semibold tracking-snug">
              Golmuri Janch Ghar
            </span>
            <span className="text-[11px] text-muted">
              Diagnostic lab · Jamshedpur
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-[13px]">
          <NavLink href="/info">Lab info</NavLink>
          <NavLink href="/tests">Tests</NavLink>
          <NavLink href="/book">Book visit</NavLink>
          <ThemeToggle />
          <Link
            href="/login"
            className="ml-1 inline-flex items-center rounded-lg bg-brand text-brand-fg px-3.5 py-1.5 text-[13px] font-medium tap hover:opacity-90"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="hidden sm:inline-block px-2.5 py-1.5 rounded-md text-soft hover:text-text hover:bg-surface tap"
    >
      {children}
    </Link>
  );
}
