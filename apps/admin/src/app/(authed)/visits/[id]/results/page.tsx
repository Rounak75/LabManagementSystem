import { getSessionUser } from "@/lib/auth-session";
import { getVisitForResults } from "@/lib/data-results";
import { ResultsForm } from "./ResultsForm";
import { notFound } from "next/navigation";

type Embedded<T> = T | T[] | null;
function one<T>(v: Embedded<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function ResultsPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const data = await getVisitForResults(user.token, params.id);
  if (!data) notFound();

  const { visit, parameters, results } = data;
  const patient = one(visit.patients as Embedded<{ id: string; name: string; phone: string; age: number; sex: "Male" | "Female" | "Other"; patient_id: string }>);
  if (!patient) notFound();

  const visitTests = (visit.visit_tests ?? []) as Array<{
    id: string;
    test_id: string;
    tests: Embedded<{ id: string; name: string }>;
  }>;

  return (
    <div>
      <h1 className="page-title mb-1">{patient.name}</h1>
      <p className="mb-4 text-sm text-slate-500">
        {visit.visit_id ?? visit.id} · {patient.age}
        {patient.sex[0].toLowerCase()} · Status: <strong className="text-slate-700">{visit.status}</strong>
      </p>
      <ResultsForm
        visitId={visit.id}
        patient={{ age: patient.age, sex: patient.sex }}
        visitTests={visitTests.map((vt) => ({
          id: vt.id,
          test_id: vt.test_id,
          testName: one(vt.tests)?.name ?? "Test",
        }))}
        parameters={parameters}
        initialResults={results}
      />
    </div>
  );
}
