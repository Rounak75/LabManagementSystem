import { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { call } from "@/lib/api";

const links = [
  { to: "/",            label: "Dashboard" },
  { to: "/visits/new",  label: "New Visit" },
  { to: "/patients",    label: "Patients" },
  { to: "/reports",     label: "Reports" },
  { to: "/outsourced",  label: "Outsourced" },
  { to: "/tests",       label: "Tests",   admin: true },
  { to: "/doctors",     label: "Doctors", admin: true },
  { to: "/users",       label: "Users", admin: true },
  { to: "/audit",       label: "Audit log", admin: true },
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
  const isOpen = settings?.isOpenToday;
  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r bg-white relative">
        <div className="border-b px-4 py-4">
          <div className="text-lg font-semibold text-brand">Golmuri Janch Ghar</div>
          <div className="text-xs text-slate-500">{user?.name} · {user?.role}</div>
          {settings && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              <span
                className={`h-2 w-2 rounded-full ${isOpen ? "bg-green-500" : "bg-red-500"}`}
                aria-hidden="true"
              />
              <span>{isOpen ? "Open" : "Closed"}</span>
            </div>
          )}
        </div>
        <nav className="flex flex-col p-2">
          {links.filter(l => !l.admin).map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"}`}>
              {l.label}
            </NavLink>
          ))}
          {user?.role === "Admin" && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-3 mt-4 mb-1">
                Admin
              </div>
              {links.filter(l => l.admin).map(l => (
                <NavLink key={l.to} to={l.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2 text-sm ${isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                  {l.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="absolute bottom-4 left-4">
          <Button variant="ghost" onClick={logout}>Log out</Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50 p-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
