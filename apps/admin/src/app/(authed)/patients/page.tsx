import { getSessionUser } from "@/lib/auth-session";
import { listPatients } from "@/lib/data-patients";
import { PatientList } from "./PatientList";
import Link from "next/link";

export default async function PatientsPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = (await getSessionUser())!;
  const q = searchParams.q;
  const patients = await listPatients(user.token, q);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <Link href="/patients/new" className="bg-blue-600 text-white rounded px-3 py-2 text-sm font-medium">
          + New patient
        </Link>
      </div>
      <form>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, or LAB-ID"
          className="w-full border rounded px-3 py-2 mb-4"
        />
      </form>
      <PatientList items={patients} />
    </div>
  );
}
