import { getSessionUser } from "@/lib/auth-session";
import { listPatients } from "@/lib/data-patients";
import { PatientList } from "./PatientList";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

export default async function PatientsPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = (await getSessionUser())!;
  const q = searchParams.q;
  const patients = await listPatients(user.token, q);
  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle={q ? `${patients.length} match${patients.length === 1 ? "" : "es"} for “${q}”` : `${patients.length} registered`}
      >
        <Link href="/patients/new" className="btn-primary">+ New patient</Link>
      </PageHeader>

      <form className="relative mb-4">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, or LAB-ID"
          className="input pl-10"
          autoComplete="off"
        />
      </form>
      <PatientList items={patients} />
    </div>
  );
}
