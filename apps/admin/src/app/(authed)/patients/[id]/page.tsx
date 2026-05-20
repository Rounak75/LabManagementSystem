import { getSessionUser } from "@/lib/auth-session";
import { getPatient } from "@/lib/data-patients";
import { listVisits } from "@/lib/data-visits";
import { formatPhone, formatDateShort } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPatient(user.token, params.id);
  if (!p) notFound();
  const visits = await listVisits(user.token, { patientId: params.id });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {p.patient_id ?? "—"} · {p.age ?? "?"}
        {p.sex ? p.sex[0].toLowerCase() : ""} · {p.phone ? formatPhone(p.phone) : "no phone"}
      </p>
      <Link
        href={`/visits/new?patientId=${p.id}`}
        className="bg-blue-600 text-white rounded px-3 py-2 text-sm font-medium"
      >
        + New visit
      </Link>

      <h2 className="text-lg font-semibold mt-6 mb-2">Visits</h2>
      {visits.length === 0 ? (
        <p className="text-gray-500 text-sm">No visits yet.</p>
      ) : (
        <ul className="divide-y bg-white rounded border">
          {visits.map((v: { id: string; visit_id: string | null; visit_date: string; status: string }) => (
            <li key={v.id}>
              <Link href={`/visits/${v.id}`} className="flex justify-between px-4 py-3 hover:bg-gray-50">
                <span className="text-sm">{v.visit_id ?? v.id}</span>
                <span className="text-xs text-gray-500">{formatDateShort(v.visit_date)} · {v.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
