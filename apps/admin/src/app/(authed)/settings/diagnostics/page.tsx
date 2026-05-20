import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { resolveUserNames } from "@/lib/data-audit";
import { redirect } from "next/navigation";

interface ClientErrorRow {
  id: string;
  user_id: string | null;
  user_agent: string;
  url: string;
  message: string;
  stack: string | null;
  logged_at: string;
}

export default async function DiagnosticsPage() {
  const user = (await getSessionUser())!;
  if (user.role !== "Admin") redirect("/dashboard");
  const sb = getServerSupabase(user.token);
  const { data } = await sb
    .from("client_errors")
    .select("id, user_id, user_agent, url, message, stack, logged_at")
    .order("logged_at", { ascending: false })
    .limit(100);
  const errors = (data ?? []) as ClientErrorRow[];
  const names = await resolveUserNames(
    user.token,
    errors.map((e) => e.user_id ?? "").filter(Boolean),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Diagnostics — recent client errors</h1>
      {errors.length === 0 ? (
        <p className="text-sm text-gray-500">No errors logged.</p>
      ) : (
        <ul className="space-y-2">
          {errors.map((e) => (
            <li key={e.id} className="bg-white rounded border p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-red-700">{e.message}</span>
                <span className="text-xs text-gray-500">{new Date(e.logged_at).toLocaleString("en-IN")}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {(e.user_id && names.get(e.user_id)) || "anon"} · {e.url}
              </div>
              {e.stack && <pre className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{e.stack}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
