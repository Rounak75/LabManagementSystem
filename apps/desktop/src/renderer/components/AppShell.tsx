import { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { call } from "@/lib/api";
import { SidebarCloudIcon } from "@/components/SidebarCloudIcon";
import { UpdateBanner } from "@/components/UpdateBanner";
import logo from "@/assets/logo.png";

const links = [
  { to: "/",            label: "Dashboard" },
  { to: "/bookings",    label: "Bookings" },
  { to: "/patients",    label: "Patients" },
  { to: "/visits/new",  label: "New Visit" },
  { to: "/reports",     label: "Reports" },
  { to: "/outsourced",  label: "Outsourced" },
  { to: "/tests",       label: "Tests",   admin: true },
  { to: "/doctors",     label: "Doctors", admin: true },
  { to: "/users",       label: "Users", admin: true },
  { to: "/audit",       label: "Audit log", admin: true },
  { to: "/notifications",label: "Notifications", admin: true },
  { to: "/sync",        label: "Sync log", admin: true },
  { to: "/templates",   label: "Templates", admin: true },
  { to: "/settings",    label: "Settings", admin: true }
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => call<any>("settings:get"),
    refetchInterval: 60_000,
    enabled: !!user
  });
  const { data: appInfo } = useQuery({
    queryKey: ["appVersion"],
    queryFn: () => call<{ version: string }>("app:getVersion"),
    staleTime: Infinity,
  });
  const isOpen = settings?.isOpenToday;
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between px-4 py-2.5 text-[14px] font-medium transition-colors ${
      isActive
        ? "bg-white text-[#2f3542] border-l-4 border-brand font-semibold shadow-sm"
        : "text-slate-300 hover:bg-[#3a4150] hover:text-white border-l-4 border-transparent"
    }`;
  return (
    <div className="flex h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[#1e232c] bg-[#2f3542] text-white shadow-xl z-20">
        <div className="border-b border-[#1e232c] bg-[#282d38] px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <img src={logo} alt="Logo" className="w-8 h-8 rounded bg-white shadow-sm" />
            <div className="text-[17px] leading-tight font-extrabold tracking-tight text-white">Golmuri Janch Ghar</div>
          </div>
          <div className="text-xs font-medium text-slate-400">{user?.name} · {user?.role}</div>
          {settings && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#1e232c] px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-700">
                <span
                  className={`h-2 w-2 rounded-full ${isOpen ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"}`}
                  aria-hidden="true"
                />
                <span>{isOpen ? "Open" : "Closed"}</span>
              </div>
              <div className="text-slate-400"><SidebarCloudIcon /></div>
            </div>
          )}
        </div>
        <nav className="scrollbar-thin flex flex-1 flex-col overflow-y-auto py-2">
          {links.filter(l => !l.admin).map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} className={linkClass}>
              {({ isActive }) => (
                <span>{l.label}</span>
              )}
            </NavLink>
          ))}
          {user?.role === "Admin" && (
            <>
              <div className="mb-1 mt-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Admin
              </div>
              {links.filter(l => l.admin).map(l => (
                <NavLink key={l.to} to={l.to} className={linkClass}>
                  {({ isActive }) => (
                    <span>{l.label}</span>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="border-t border-[#1e232c] bg-[#282d38] p-4">
          <UpdateBanner />
          <Button variant="ghost" className="w-full justify-start text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" onClick={logout}>Log out</Button>
          {appInfo?.version && (
            <div className="px-4 pt-2 text-[10px] text-slate-500 font-mono">v{appInfo.version}</div>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50 p-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
