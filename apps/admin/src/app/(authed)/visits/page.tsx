import { getSessionUser } from "@/lib/auth-session";
import { listVisits, listPendingVerifyVisits } from "@/lib/data-visits";
import { formatDateShort } from "@/lib/format";
import Link from "next/link";
import { PendingVerifyActions } from "./PendingVerifyActions";
import type { BatchCandidate } from "../dashboard/BatchVerifyDialog";

interface VisitRow {
  id: string;
  visit_id: string | null;
  visit_date: string;
  status: string;
  source: string | null;
  patients: { name: string } | { name: string }[] | null;
}

function patientName(p: VisitRow["patients"]): string {
  if (!p) return "—";
  if (Array.isArray(p)) return p[0]?.name ?? "—";
  return p.name;
}

export default async function VisitsPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = (await getSessionUser())!;
  const status = searchParams.status;
  const visits = (await listVisits(user.token, status ? { status } : undefined)) as unknown as VisitRow[];

  // For the PendingVerify view, compute low-risk (no abnormal result) candidates
  // for the admin-only bulk verify action.
  let candidates: BatchCandidate[] = [];
  const showBatch = user.role === "Admin" && status === "PendingVerify";
  if (showBatch) {
    const pending = (await listPendingVerifyVisits(user.token)) as Array<{
      id: string;
      visit_id: string | null;
      patients: { name: string } | { name: string }[] | null;
      visit_tests: Array<{ results: Array<{ is_abnormal: boolean | null }> | null }> | null;
    }>;
    candidates = pending
      .filter((v) => !(v.visit_tests ?? []).some((vt) => (vt.results ?? []).some((r) => r.is_abnormal)))
      .map((v) => ({
        id: v.id,
        visit_id: v.visit_id ?? v.id,
        patientName: Array.isArray(v.patients) ? v.patients[0]?.name ?? "—" : v.patients?.name ?? "—",
      }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-semibold">
          {status === "PendingVerify" ? "Awaiting verify" : "Visits"}
        </h1>
        {showBatch && <PendingVerifyActions candidates={candidates} />}
      </div>
      {visits.length === 0 ? (
        <p className="text-gray-500">No visits{status ? " in this state" : ""} yet.</p>
      ) : (
        <ul className="divide-y bg-white rounded border">
          {visits.map((v) => (
            <li key={v.id}>
              <Link href={`/visits/${v.id}`} className="flex justify-between px-4 py-3 hover:bg-gray-50">
                <div>
                  <div className="font-medium">{patientName(v.patients)}</div>
                  <div className="text-xs text-gray-500">
                    {v.visit_id ?? v.id} · {formatDateShort(v.visit_date)} · {v.status}
                  </div>
                </div>
                {v.source === "admin" && (
                  <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5 self-center">phone</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
