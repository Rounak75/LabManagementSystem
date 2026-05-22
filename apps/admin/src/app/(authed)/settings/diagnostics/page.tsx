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
      <h1 className="page-title mb-4">Diagnostics — recent client errors</h1>
      {errors.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No errors logged.</div>
      ) : (
        <ul className="space-y-2">
          {errors.map((e) => (
            <li key={e.id} className="card p-3.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-rose-700">{e.message}</span>
                <span className="shrink-0 text-xs text-slate-400">{new Date(e.logged_at).toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {(e.user_id && names.get(e.user_id)) || "anon"} · {e.url}
              </div>
              {e.stack && <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">{e.stack}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
