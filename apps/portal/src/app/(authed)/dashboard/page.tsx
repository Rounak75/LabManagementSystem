// Phase 3d Plan D — patient dashboard. Shows recent visits with status + a
// link to the report or pay page. Reads via the service client + JWT-scoped
// queries (RLS still enforces patient_id scoping).

import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePatient } from "@portal/lib/session";
import { getServiceClient } from "@portal/lib/supabase-server";

export const runtime = "nodejs";

interface VisitRow {
  id: string;
  visit_id: string;
  visit_date: string;
  status: string;
  invoice: { id: string; total: number; payment_status: string } | null;
}

export default async function DashboardPage() {
  let session;
  try { session = await requirePatient(); } catch { redirect("/login"); }
  const sb = getServiceClient();

  const { data: visits } = await sb
    .from("visits")
    .select("id, visit_id, visit_date, status, invoices(id, total, payment_status)")
    .eq("patient_id", session!.patientId)
    .is("deleted_at", null)
    .order("visit_date", { ascending: false })
    .limit(50);

  const { data: patient } = await sb
    .from("patients")
    .select("name")
    .eq("id", session!.patientId)
    .maybeSingle();

  const { data: heartbeat } = await sb
    .from("cloud_heartbeat")
    .select("last_pushed_at")
    .eq("id", "singleton")
    .maybeSingle();
  const lastSeen = heartbeat?.last_pushed_at ? new Date(heartbeat.last_pushed_at) : null;
  const stale = lastSeen && Date.now() - lastSeen.getTime() > 10 * 60_000;

  const rows: VisitRow[] = (visits ?? []).map((v) => ({
    id: v.id,
    visit_id: v.visit_id,
    visit_date: v.visit_date,
    status: v.status,
    invoice: Array.isArray(v.invoices) && v.invoices[0] ? v.invoices[0] : null,
  }));

  return (
    <div className="mt-2">
      <h1 className="text-xl font-semibold">Welcome{patient?.name ? `, ${patient.name}` : ""}</h1>

      {stale && (
        <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded p-3">
          The lab's desktop may be offline — information shown here was last synced{" "}
          {lastSeen ? `${Math.round((Date.now() - lastSeen.getTime()) / 60_000)} minutes ago` : "a while ago"}.
        </div>
      )}

      <div className="mt-4 flex gap-2 text-sm">
        <Link href="/invoices" className="px-3 py-1.5 bg-white border rounded">My bills</Link>
        <Link href="/account" className="px-3 py-1.5 bg-white border rounded">Account</Link>
      </div>

      <h2 className="mt-6 text-lg font-medium">Recent visits</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 mt-2">No visits on record yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 bg-white rounded border">
          {rows.map((v) => (
            <li key={v.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{v.visit_id}</div>
                <div className="text-xs text-slate-500">
                  {new Date(v.visit_date).toLocaleDateString()} · status: {v.status}
                </div>
              </div>
              <div className="flex gap-2">
                {v.status === "Completed" && (
                  <Link href={`/visits/${v.id}`} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded">
                    View report
                  </Link>
                )}
                {v.invoice && v.invoice.payment_status !== "Paid" && (
                  <Link href={`/invoices/${v.invoice.id}/pay`} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded">
                    Pay ₹{Number(v.invoice.total).toFixed(0)}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
