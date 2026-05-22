import { getSessionUser } from "@/lib/auth-session";
import { listVisits, listPendingVerifyVisits } from "@/lib/data-visits";
import { formatDateShort } from "@/lib/format";
import Link from "next/link";
import { PendingVerifyActions } from "./PendingVerifyActions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, SourceBadge } from "@/components/StatusBadge";
import { FilterTabs } from "@/components/FilterTabs";
import type { BatchCandidate } from "../dashboard/BatchVerifyDialog";

const VISIT_TABS = [
  { label: "All", value: null },
  { label: "Open", value: "Open" },
  { label: "Awaiting verify", value: "PendingVerify" },
  { label: "Completed", value: "Completed" },
];

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
  const status = searchParams.status ?? null;
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
      <PageHeader title="Visits" subtitle={`${visits.length} ${status ? "in this view" : "recent"}`}>
        <Link href="/visits/new" className="btn-primary">+ New visit</Link>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterTabs basePath="/visits" param="status" current={status} options={VISIT_TABS} />
        {showBatch && <PendingVerifyActions candidates={candidates} />}
      </div>

      {visits.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No visits{status ? " in this view" : " yet"}.
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {visits.map((v) => (
            <li key={v.id}>
              <Link href={`/visits/${v.id}`} className="row-link">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{patientName(v.patients)}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {v.visit_id ?? v.id} · {formatDateShort(v.visit_date)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SourceBadge source={v.source} />
                  <StatusBadge status={v.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
