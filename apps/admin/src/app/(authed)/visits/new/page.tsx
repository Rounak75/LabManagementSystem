import { getSessionUser } from "@/lib/auth-session";
import { listActiveTests } from "@/lib/data-tests";
import { getPatient } from "@/lib/data-patients";
import { NewVisitForm } from "./NewVisitForm";

export default async function NewVisitPage({ searchParams }: { searchParams: { patientId?: string } }) {
  const user = (await getSessionUser())!;
  const patientId = searchParams.patientId;
  const tests = await listActiveTests(user.token);
  const patient = patientId ? await getPatient(user.token, patientId) : null;
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold mb-4">New visit</h1>
      <NewVisitForm patient={patient} tests={tests} />
    </div>
  );
}
