import { NavBar } from "@/components/NavBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ErrorReporterMount } from "@/components/ErrorReporterMount";
import { getSessionUser } from "@/lib/auth-session";
import { redirect } from "next/navigation";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div>
      <ErrorReporterMount />
      <NavBar user={user} />
      <OfflineBanner />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
