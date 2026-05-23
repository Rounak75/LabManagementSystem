import { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { call } from "@/lib/api";
import { SidebarCloudIcon } from "@/components/SidebarCloudIcon";
import { UpdateBanner } from "@/components/UpdateBanner";

const links = [
  { to: "/",            label: "Dashboard" },
  { to: "/visits/new",  label: "New Visit" },
  { to: "/patients",    label: "Patients" },
  { to: "/reports",     label: "Reports" },
  { to: "/outsourced",  label: "Outsourced" },
  { to: "/tests",       label: "Tests",   admin: true },
  { to: "/doctors",     label: "Doctors", admin: true },
  { to: "/users",          label: "Users", admin: true },
  { to: "/bookings",       label: "Bookings", admin: true },
  { to: "/audit",          label: "Audit log", admin: true },
  { to: "/notifications",  label: "Notifications", admin: true },
  { to: "/sync",           label: "Sync log", admin: true },
  { to: "/templates",      label: "Templates", admin: true },
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
    `block rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"}`;
  return (
    <div className="flex h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-white">
        <div className="border-b px-4 py-3">
          <div className="text-lg font-semibold text-brand">Golmuri Janch Ghar</div>
          <div className="text-xs text-slate-500">{user?.name} · {user?.role}</div>
          {settings && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                <span
                  className={`h-2 w-2 rounded-full ${isOpen ? "bg-green-500" : "bg-red-500"}`}
                  aria-hidden="true"
                />
                <span>{isOpen ? "Open" : "Closed"}</span>
              </div>
              <SidebarCloudIcon />
            </div>
          )}
        </div>
        <nav className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {links.filter(l => !l.admin).map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
          {user?.role === "Admin" && (
            <>
              <div className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Admin
              </div>
              {links.filter(l => l.admin).map(l => (
                <NavLink key={l.to} to={l.to} className={linkClass}>
                  {l.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="border-t p-2">
          <UpdateBanner />
          <Button variant="ghost" className="w-full justify-start" onClick={logout}>Log out</Button>
          {appInfo?.version && (
            <div className="px-3 pt-1 text-[10px] text-slate-400">v{appInfo.version}</div>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50 p-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
