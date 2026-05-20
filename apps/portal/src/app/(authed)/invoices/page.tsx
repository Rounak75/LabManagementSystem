import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePatient } from "@portal/lib/session";
import { getServiceClient } from "@portal/lib/supabase-server";

export const runtime = "nodejs";

export default async function InvoicesPage() {
  let session;
  try { session = await requirePatient(); } catch { redirect("/login"); }
  const sb = getServiceClient();

  const { data: invoices } = await sb
    .from("invoices")
    .select("id, total, payment_status, amount_paid, created_at, visits(visit_id, patient_id)")
    .order("created_at", { ascending: false });

  const mine = (invoices ?? []).filter((i) => {
    const v = Array.isArray(i.visits) ? i.visits[0] : i.visits;
    return v?.patient_id === session!.patientId;
  });

  return (
    <div className="mt-2">
      <h1 className="text-xl font-semibold">My bills</h1>
      {mine.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No bills on record.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 bg-white rounded border">
          {mine.map((i) => {
            const v = Array.isArray(i.visits) ? i.visits[0] : i.visits;
            const due = Number(i.total) - Number(i.amount_paid ?? 0);
            return (
              <li key={i.id} className="p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{v?.visit_id ?? "Visit"}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(i.created_at).toLocaleDateString()} · {i.payment_status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">₹{Number(i.total).toFixed(0)}</div>
                  {i.payment_status !== "Paid" && (
                    <Link
                      href={`/invoices/${i.id}/pay`}
                      className="inline-block mt-1 px-3 py-1 text-xs bg-green-600 text-white rounded"
                    >
                      Pay ₹{due.toFixed(0)}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
