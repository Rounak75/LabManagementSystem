"use client";
import { useState } from "react";
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import { NavLinks } from "./NavLinks";
import type { SessionUser } from "@/lib/auth-session";

export function NavBar({ user }: { user: SessionUser }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#1e232c] bg-[#282d38] px-4">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 9.5V3" />
              <path d="M8 3h8M8 13h8" />
            </svg>
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-white">Lab Admin</span>
        </div>
        {/* Every navigation in the app starts here, and it was a bare 24x24 SVG
            with no padding in the far corner — under the 44px minimum, and the
            hardest point on the screen for the thumb of the hand holding the
            phone. The icon still draws at 24px; the target around it is 44. */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="-mr-2.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 transition-colors hover:text-white active:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      
      {/* Sidebar Overlay (Mobile) */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform flex-col border-r border-[#1e232c] bg-[#2f3542] text-white shadow-xl transition-transform duration-200 ease-in-out md:static md:flex md:translate-x-0 ${isOpen ? "translate-x-0 flex" : "-translate-x-full hidden"}`}>
      <div className="flex h-16 items-center px-6 border-b border-[#1e232c] bg-[#282d38]">
        <Link href="/dashboard" prefetch className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 9.5V3" />
              <path d="M8 3h8M8 13h8" />
            </svg>
          </span>
          <span className="text-[16px] font-extrabold tracking-tight text-white">Lab Admin</span>
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <NavLinks isAdmin={user.role === "Admin"} />
      </div>
      
      <div className="p-4 border-t border-[#1e232c] bg-[#282d38]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white truncate">{user.username}</span>
            <span className="text-xs font-medium text-slate-400 truncate">{user.role}</span>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
    </>
  );
}
