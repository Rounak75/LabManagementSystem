import { getSessionUser } from "@/lib/auth-session";
import { listActiveTests } from "@/lib/data-tests";
import { getPatient } from "@/lib/data-patients";
import { NewVisitForm } from "./NewVisitForm";
import { PageHeader } from "@/components/PageHeader";

export default async function NewVisitPage({ searchParams }: { searchParams: { patientId?: string } }) {
  const user = (await getSessionUser())!;
  const patientId = searchParams.patientId;
  const tests = await listActiveTests(user.token);
  const patient = patientId ? await getPatient(user.token, patientId) : null;
  return (
    <div className="max-w-lg">
      <PageHeader title="New visit" subtitle="Pick the tests the doctor ordered" />
      <div className="card p-5 sm:p-6">
        <NewVisitForm patient={patient} tests={tests} />
      </div>
    </div>
  );
}
