import { getSessionUser } from "@/lib/auth-session";
import { getPatient } from "@/lib/data-patients";
import { listVisits } from "@/lib/data-visits";
import { formatPhone, formatDateShort } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPatient(user.token, params.id);
  if (!p) notFound();
  const visits = await listVisits(user.token, { patientId: params.id });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700">
            {p.name?.[0]?.toUpperCase() ?? "?"}
          </span>
          <div>
            <h1 className="page-title">{p.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {p.patient_id ?? "—"} · {p.age ?? "?"}
              {p.sex ? p.sex[0].toLowerCase() : ""} · {p.phone ? formatPhone(p.phone) : "no phone"}
            </p>
          </div>
        </div>
        <Link href={`/visits/new?patientId=${p.id}`} className="btn-primary">
          + New visit
        </Link>
      </div>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Visits</h2>
      {visits.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No visits yet.</div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {visits.map((v: { id: string; visit_id: string | null; visit_date: string; status: string }) => (
            <li key={v.id}>
              <Link href={`/visits/${v.id}`} className="row-link">
                <span className="text-sm font-medium text-slate-800">{v.visit_id ?? v.id}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {formatDateShort(v.visit_date)}
                  <StatusBadge status={v.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
