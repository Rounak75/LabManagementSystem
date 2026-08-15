import { ReactNode, Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { call } from "@/lib/api";
import { SidebarCloudIcon } from "@/components/SidebarCloudIcon";
import { UpdateBanner } from "@/components/UpdateBanner";
import { PageLoading } from "@/components/PageLoading";
// @ts-ignore
import logo from "@/assets/logo.png";
import {
  LayoutDashboard,
  Calendar,
  Users,
  PlusCircle,
  FileText,
  Truck,
  TestTube,
  Stethoscope,
  UserCog,
  Activity,
  Bell,
  RefreshCw,
  FileCode,
  Settings,
  LogOut
} from "lucide-react";

const links = [
  { to: "/",            label: "Dashboard",   icon: LayoutDashboard },
  { to: "/bookings",    label: "Bookings",    icon: Calendar },
  { to: "/patients",    label: "Patients",    icon: Users },
  { to: "/visits/new",  label: "New Visit",   icon: PlusCircle },
  { to: "/reports",     label: "Reports",     icon: FileText },
  { to: "/outsourced",  label: "Outsourced",  icon: Truck },
  { to: "/tests",       label: "Tests",       icon: TestTube,   admin: true },
  { to: "/doctors",     label: "Doctors",     icon: Stethoscope, admin: true },
  { to: "/users",       label: "Users",       icon: UserCog,    admin: true },
  { to: "/audit",       label: "Audit log",   icon: Activity,   admin: true },
  { to: "/notifications",label: "Notifications", icon: Bell,    admin: true },
  { to: "/sync",        label: "Sync log",    icon: RefreshCw,  admin: true },
  { to: "/templates",   label: "Templates",   icon: FileCode,   admin: true },
  { to: "/settings",    label: "Settings",    icon: Settings,   admin: true }
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
    queryFn: () => call("app:getVersion"),
    staleTime: Infinity,
  });
  const isOpen = settings?.isOpenToday;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ease-out-fluid active:scale-[0.98] ${
      isActive
        ? "bg-brand/10 text-brand shadow-inner-bezel-dark"
        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
    }`;

  return (
    <div className="flex h-screen bg-slate-100 p-3 font-sans selection:bg-brand/20">
      <aside className="flex w-64 shrink-0 flex-col rounded-[2rem] border border-[#1f2937] bg-[#111827] shadow-ambient">
        <div className="p-6 pb-2">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 shadow-sm">
              <img src={logo} alt="Logo" className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-[15px] font-bold tracking-tight text-slate-100">Golmuri Janch Ghar</div>
              <div className="text-[11px] font-medium tracking-wide text-slate-500">{user?.name} · {user?.role}</div>
            </div>
          </div>
          {settings && (
            <div className="mb-2 flex items-center justify-between rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 shadow-inner-bezel-dark">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isOpen ? "bg-emerald-400" : "bg-rose-400"}`}></span>
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${isOpen ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                </span>
                <span className="text-xs font-semibold text-slate-300">{isOpen ? "Open" : "Closed"}</span>
              </div>
              <div className="text-slate-500"><SidebarCloudIcon /></div>
            </div>
          )}
        </div>
        
        <nav className="scrollbar-thin flex flex-1 flex-col overflow-y-auto px-4 py-2 gap-0.5">
          <div className="mx-4 mb-2 mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Operations
          </div>
          {links.filter(l => !l.admin).map(l => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} end={l.to === "/"} className={linkClass}>
                {({ isActive }) => (
                  <>
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-brand" : "text-slate-400 group-hover:text-slate-300"} transition-colors duration-200`} strokeWidth={2} />
                    <span>{l.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
          {user?.role === "Admin" && (
            <>
              <div className="mx-4 mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-t border-slate-800 pt-4">
                Administration
              </div>
              {links.filter(l => l.admin).map(l => {
                const Icon = l.icon;
                return (
                  <NavLink key={l.to} to={l.to} className={linkClass}>
                    {({ isActive }) => (
                      <>
                        <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-400"} transition-colors duration-200`} strokeWidth={2} />
                        <span>{l.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>
        
        <div className="mt-auto border-t border-slate-800/60 p-4 pb-6">
          <UpdateBanner />
          <button 
            className="w-full group flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ease-out-fluid active:scale-[0.98] text-slate-400 hover:bg-rose-500/10 hover:text-rose-400" 
            onClick={logout}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0 text-slate-500 group-hover:text-rose-400 transition-colors duration-200" strokeWidth={2} />
            <span>Log out</span>
          </button>
          {appInfo?.version && (
            <div className="mt-3 px-4 text-[10px] text-slate-600 font-mono">v{appInfo.version}</div>
          )}
        </div>
      </aside>

      <main className="ml-4 flex flex-1 flex-col overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white shadow-ambient">
        <div className="flex-1 overflow-auto px-10 py-10">
          {/* Pages are loaded on demand, so the boundary belongs here rather than
              around the router: suspending inside the content area keeps the
              sidebar and header on screen instead of blanking the whole app for
              the moment a chunk is read off disk. */}
          <Suspense fallback={<PageLoading />}>{children ?? <Outlet />}</Suspense>
        </div>
      </main>
    </div>
  );
}
