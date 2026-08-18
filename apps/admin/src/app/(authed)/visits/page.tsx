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

export default async function VisitsPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const searchParams = await searchParamsPromise;
  const user = (await getSessionUser())!;
  const status = searchParams.status ?? null;
  const q = searchParams.q?.toLowerCase() || "";
  let visits = (await listVisits(user.token, status ? { status } : undefined)) as unknown as VisitRow[];

  if (q) {
    visits = visits.filter(v => {
      const pName = patientName(v.patients).toLowerCase();
      const vId = (v.visit_id ?? v.id).toLowerCase();
      return pName.includes(q) || vId.includes(q);
    });
  }

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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs basePath="/visits" param="status" current={status} options={VISIT_TABS} />
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {showBatch && <PendingVerifyActions candidates={candidates} />}
          
          <form action="/visits" method="get" className="relative flex-1 sm:w-64">
            {status && <input type="hidden" name="status" value={status} />}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input 
              type="text" 
              name="q"
              defaultValue={searchParams.q || ""}
              placeholder="Search patients or IDs..." 
              className="w-full rounded-full border border-slate-300 py-1.5 pl-9 pr-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand shadow-sm bg-white"
            />
          </form>
        </div>
      </div>

      {visits.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No visits{status ? " in this view" : " yet"}.
        </div>
      ) : (
        <>
        {/* Phone gets a scannable list, not a sideways table. The table below is
            `overflow-x-auto whitespace-nowrap` across six columns, so on a 360px
            screen Source and Status — the two things a staff member scans a
            visit list *for* — sat off the right edge behind a two-handed
            horizontal swipe nested inside a vertical one. `.row-link` is the
            list primitive this app already uses on Patients. */}
        <div className="card divide-y divide-slate-100 md:hidden">
          {visits.map((v) => (
            <Link key={v.id} href={`/visits/${v.id}`} className="row-link">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">
                  {patientName(v.patients)}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-600">
                  <span className="truncate font-mono">{v.visit_id ?? v.id}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{formatDateShort(v.visit_date)}</span>
                  <SourceBadge source={v.source} />
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusBadge status={v.status} />
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4 text-slate-400"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </Link>
          ))}
        </div>

        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Visit ID</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Date</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Patient Name</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Source</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visits.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3.5 font-mono text-slate-600">
                    <Link href={`/visits/${v.id}`} className="block">{v.visit_id ?? v.id}</Link>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">
                    <Link href={`/visits/${v.id}`} className="block">{formatDateShort(v.visit_date)}</Link>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    <Link href={`/visits/${v.id}`} className="block">{patientName(v.patients)}</Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <SourceBadge source={v.source} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={v.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
