import { getSessionUser } from "@/lib/auth-session";
import { getVisitForResults } from "@/lib/data-results";
import { VerifyView } from "./VerifyView";
import { notFound, redirect } from "next/navigation";

type Embedded<T> = T | T[] | null;
function one<T>(v: Embedded<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function VerifyPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  if (user.role !== "Admin") redirect("/visits");
  const data = await getVisitForResults(user.token, params.id);
  if (!data) notFound();

  const { visit, parameters, results } = data;
  const patient = one(
    visit.patients as Embedded<{ name: string; phone: string; age: number; sex: "Male" | "Female" | "Other" }>,
  );
  if (!patient) notFound();

  const visitTests = (visit.visit_tests ?? []) as Array<{
    id: string;
    test_id: string;
    tests: Embedded<{ id: string; name: string }>;
  }>;

  return (
    <VerifyView
      visitId={visit.id}
      visitIdLabel={visit.visit_id ?? visit.id}
      visitDate={visit.visit_date}
      patient={patient}
      visitTests={visitTests.map((vt) => ({
        id: vt.id,
        test_id: vt.test_id,
        testName: one(vt.tests)?.name ?? "Test",
      }))}
      parameters={parameters}
      results={results}
    />
  );
}
