import { NavBar } from "@/components/NavBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SyncHealthBanner } from "@/components/SyncHealthBanner";
import { ErrorReporterMount } from "@/components/ErrorReporterMount";
import { getSessionUser } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50">
      <ErrorReporterMount />
      
      {/* Sidebar Navigation */}
      <NavBar user={user} />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />
        <SyncHealthBanner token={user.token} />
        <main className="flex-1 px-4 sm:px-6 md:px-8 py-6 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
