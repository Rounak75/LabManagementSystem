import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { UpiVpaForm } from "./UpiVpaForm";
import { PasswordForm } from "./PasswordForm";
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
    <div className="max-w-md space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section>
        <h2 className="text-lg font-semibold mb-2">UPI direct payments</h2>
        <UpiVpaForm
          initial={{
            lab_upi_vpa: (settings?.lab_upi_vpa as string) ?? "",
            lab_upi_payee_name: (settings?.lab_upi_payee_name as string) ?? "",
          }}
          canEdit={user.role === "Admin"}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Change password</h2>
        <PasswordForm />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Security</h2>
        <form action="/api/settings/sign-out-everywhere" method="post">
          <button type="submit" className="bg-yellow-100 text-yellow-900 rounded px-3 py-2 text-sm">
            Sign out everywhere
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">Signs you out on every device, including this one.</p>
      </section>

      {user.role === "Admin" && (
        <section>
          <Link href="/settings/diagnostics" className="text-sm text-blue-600 hover:underline">
            View diagnostics →
          </Link>
        </section>
      )}
    </div>
  );
}
