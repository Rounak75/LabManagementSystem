import { getSessionUser } from "@/lib/auth-session";
import { getVisit } from "@/lib/data-visits";
import { formatDateShort } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "./print/PrintButton";
import { StatusBadge } from "@/components/StatusBadge";

interface VisitTest {
  id: string;
  status: string | null;
  tests: { name: string } | { name: string }[] | null;
}

function testName(t: VisitTest["tests"]): string {
  if (!t) return "—";
  if (Array.isArray(t)) return t[0]?.name ?? "—";
  return t.name;
}

export default async function VisitDetailPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const v = await getVisit(user.token, params.id);
  if (!v) notFound();
  const patient = Array.isArray(v.patients) ? v.patients[0] : v.patients;
  const visitTests: VisitTest[] = v.visit_tests ?? [];

  return (
    <div>
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

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Tests</h2>
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
    </div>
  );
}
