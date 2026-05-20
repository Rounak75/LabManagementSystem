import { getSessionUser } from "@/lib/auth-session";
import { getVisit } from "@/lib/data-visits";
import { formatDateShort } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "./print/PrintButton";

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
      <h1 className="text-2xl font-semibold mb-1">{patient?.name ?? "—"}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {v.visit_id ?? v.id} · {formatDateShort(v.visit_date)} · {v.status}
      </p>

      <div className="flex items-center gap-3 mb-4">
        {v.status === "PendingVerify" && (
          <Link
            href={`/visits/${v.id}/verify`}
            className="inline-block bg-green-600 text-white rounded px-3 py-2 text-sm font-medium"
          >
            Review &amp; verify
          </Link>
        )}
        <PrintButton visitId={v.id} verified={!!v.verified_at} />
      </div>

      <h2 className="text-lg font-semibold mb-2">Tests</h2>
      <ul className="bg-white rounded border divide-y">
        {visitTests.map((vt) => (
          <li key={vt.id} className="px-4 py-3 flex justify-between">
            <div>
              <div className="font-medium">{testName(vt.tests)}</div>
              <div className="text-xs text-gray-500">{vt.status ?? "—"}</div>
            </div>
            <Link href={`/visits/${v.id}/results?test=${vt.id}`} className="text-sm text-blue-600 hover:underline">
              Enter results
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
