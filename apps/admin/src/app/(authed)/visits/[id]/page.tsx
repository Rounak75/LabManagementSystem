import { getSessionUser } from "@/lib/auth-session";
import { getVisit } from "@/lib/data-visits";
import { formatDateShort } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "./print/PrintButton";
import { BillingPanel } from "./BillingPanel";
import { StatusBadge } from "@/components/StatusBadge";

interface VisitTest {
  id: string;
  status: string | null;
  is_locked?: boolean | null;
  tests: { name: string } | { name: string }[] | null;
}

function testName(t: VisitTest["tests"]): string {
  if (!t) return "—";
  if (Array.isArray(t)) return t[0]?.name ?? "—";
  return t.name;
}

export default async function VisitDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await paramsPromise;
  const { sent } = await searchParamsPromise;
  const user = (await getSessionUser())!;
  const v = await getVisit(user.token, params.id);
  if (!v) notFound();
  const patient = Array.isArray(v.patients) ? v.patients[0] : v.patients;
  const visitTests: VisitTest[] = v.visit_tests ?? [];
  const invoice = Array.isArray(v.invoices) ? v.invoices[0] : v.invoices;
  const allVerified = visitTests.length > 0 && visitTests.every((vt) => vt.is_locked === true);

  return (
    <div>
      {/* The results flow used to end on a silent redirect: the highest-stakes
          screen in the app finished with no confirmation that anything had
          happened. Peak-end says this is the moment worth spending on, and it
          was the least designed one. */}
      {sent === "1" && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-px h-4 w-4 shrink-0 text-emerald-700"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>
            Results for <span className="font-semibold">{patient?.name ?? "this patient"}</span> were
            sent to verify. An Admin reviews and locks them before the report can be printed.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">{patient?.name ?? "—"}</h1>
          <p className="text-sm text-slate-500">
            {v.visit_id ?? v.id} · {formatDateShort(v.visit_date)}
          </p>
        </div>
        <StatusBadge status={v.status} />
      </div>

      <div className="mb-5 flex items-center gap-2">
        {v.status === "PendingVerify" && (
          <Link href={`/visits/${v.id}/verify`} className="btn-success">
            Review &amp; verify
          </Link>
        )}
        <PrintButton visitId={v.id} verified={!!v.verified_at} />
      </div>

      <BillingPanel
        visitId={v.id}
        invoice={invoice ?? null}
        overridden={v.report_release_override === true}
        allVerified={allVerified}
        isAdmin={user.role === "Admin"}
      />

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">Tests</h2>
      {/* A visit with no tests rendered an empty white card and nothing else —
          no explanation and no way forward, on a screen that otherwise always
          has an action. */}
      {visitTests.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm font-medium text-slate-900">No tests on this visit yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            A visit needs at least one test before results can be entered. This usually means the
            visit was created on the desktop and the tests have not synced yet.
          </p>
        </div>
      ) : (
      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {visitTests.map((vt) => (
          <li key={vt.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{testName(vt.tests)}</div>
              <div className="text-xs text-slate-500">{vt.status ?? "—"}</div>
            </div>
            <Link
              href={`/visits/${v.id}/results?test=${vt.id}`}
              className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              Enter results →
            </Link>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
