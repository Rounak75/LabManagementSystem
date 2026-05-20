"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ResultParameter, ResultRow } from "@/lib/data-results";
import { ParameterCard } from "./ParameterCard";
import { CriticalNotice } from "./CriticalNotice";

interface FormVisitTest {
  id: string;
  test_id: string;
  testName: string;
}

export function ResultsForm({
  visitId,
  patient,
  visitTests,
  parameters,
  initialResults,
}: {
  visitId: string;
  patient: { age: number; sex: "Male" | "Female" | "Other" };
  visitTests: FormVisitTest[];
  parameters: ResultParameter[];
  initialResults: ResultRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const grouped = visitTests.map((vt) => ({
    visitTest: vt,
    params: parameters
      .filter((p) => p.test_id === vt.test_id)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
  }));

  return (
    <div>
      <CriticalNotice />
      {grouped.map(({ visitTest, params }) => (
        <section key={visitTest.id} className="mb-6">
          <h2 className="text-lg font-semibold mb-2">{visitTest.testName}</h2>
          <div className="space-y-3">
            {params.length === 0 && (
              <p className="text-sm text-gray-500">No parameters defined for this test.</p>
            )}
            {params.map((p) => {
              const existing = initialResults.find(
                (r) => r.parameter_id === p.id && r.visit_test_id === visitTest.id,
              );
              return (
                <ParameterCard
                  key={p.id}
                  visitTestId={visitTest.id}
                  parameter={p}
                  patient={patient}
                  initialValue={existing?.value ?? ""}
                  initialResultId={existing?.id}
                  initialVersion={existing?.version ?? undefined}
                />
              );
            })}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 bg-white border-t -mx-4 px-4 py-3 mt-6">
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <button
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await fetch(`/api/visits/${visitId}/mark-pending-verify`, { method: "POST" });
              if (!r.ok) {
                setError("Could not finalize. Try again.");
                return;
              }
              router.push(`/visits/${visitId}`);
              router.refresh();
            });
          }}
          className="w-full bg-green-600 text-white rounded py-3 font-medium disabled:bg-green-300"
        >
          {pending ? "Submitting…" : "Done — send to verify"}
        </button>
      </div>
    </div>
  );
}
