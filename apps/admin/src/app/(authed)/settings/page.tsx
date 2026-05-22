import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { UpiVpaForm } from "./UpiVpaForm";
import { PasswordForm } from "./PasswordForm";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

export default async function SettingsPage() {
  const user = (await getSessionUser())!;
  const sb = getServerSupabase(user.token);
  const { data: settings } = await sb
    .from("lab_settings")
    .select("lab_upi_vpa, lab_upi_payee_name")
    .eq("id", "singleton")
    .maybeSingle();

  return (
    <div className="max-w-lg">
      <PageHeader title="Settings" />

      <div className="space-y-5">
        <section className="card p-5">
          <h2 className="mb-1 text-base font-bold text-slate-900">UPI direct payments</h2>
          <p className="mb-4 text-sm text-slate-500">Used for the QR codes patients scan to pay.</p>
          <UpiVpaForm
            initial={{
              lab_upi_vpa: (settings?.lab_upi_vpa as string) ?? "",
              lab_upi_payee_name: (settings?.lab_upi_payee_name as string) ?? "",
            }}
            canEdit={user.role === "Admin"}
          />
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-base font-bold text-slate-900">Change password</h2>
          <PasswordForm />
        </section>

        <section className="card p-5">
          <h2 className="mb-1 text-base font-bold text-slate-900">Security</h2>
          <p className="mb-4 text-sm text-slate-500">Signs you out on every device, including this one.</p>
          <form action="/api/settings/sign-out-everywhere" method="post">
            <button type="submit" className="btn-ghost text-amber-700 hover:bg-amber-50">
              Sign out everywhere
            </button>
          </form>
        </section>

        {user.role === "Admin" && (
          <Link href="/settings/diagnostics" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
            View diagnostics →
          </Link>
        )}
      </div>
    </div>
  );
}
