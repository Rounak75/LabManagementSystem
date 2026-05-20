// Phase 3d Plan D — single visit detail. Lists results inline and offers a
// "Download PDF" button that hits /api/reports/[visitId].

import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePatient } from "@portal/lib/session";
import { getServiceClient } from "@portal/lib/supabase-server";

export const runtime = "nodejs";

interface Param {
  id: string;
  name: string;
  unit: string;
  ref_range_male_min: number | null;
  ref_range_male_max: number | null;
  ref_range_female_min: number | null;
  ref_range_female_max: number | null;
  ref_range_child_min: number | null;
  ref_range_child_max: number | null;
}

interface ResultRow { value: string; is_abnormal: boolean; parameter_id: string; }

export default async function VisitPage({ params }: { params: { id: string } }) {
  let session;
  try { session = await requirePatient(); } catch { redirect("/login"); }
  const sb = getServiceClient();

  const { data: visit } = await sb
    .from("visits")
    .select("id, visit_id, visit_date, status, patient_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!visit || visit.patient_id !== session!.patientId) redirect("/dashboard");

  const { data: vts } = await sb
    .from("visit_tests")
    .select("id, test_id, tests(name, category)")
    .eq("visit_id", visit!.id);

  const testIds = (vts ?? []).map((vt) => vt.test_id);
  const { data: params2 } = await sb
    .from("parameters")
    .select("id, test_id, name, unit, ref_range_male_min, ref_range_male_max, ref_range_female_min, ref_range_female_max, ref_range_child_min, ref_range_child_max")
    .in("test_id", testIds);
  const { data: results } = await sb
    .from("results")
    .select("visit_test_id, parameter_id, value, is_abnormal")
    .in("visit_test_id", (vts ?? []).map((vt) => vt.id));

  const paramsByTest = new Map<string, Param[]>();
  (params2 ?? []).forEach((p) => {
    const arr = paramsByTest.get(p.test_id) ?? [];
    arr.push(p);
    paramsByTest.set(p.test_id, arr);
  });
  const resultsByVisitTest = new Map<string, ResultRow[]>();
  (results ?? []).forEach((r) => {
    const arr = resultsByVisitTest.get(r.visit_test_id) ?? [];
    arr.push(r);
    resultsByVisitTest.set(r.visit_test_id, arr);
  });

  return (
    <div className="mt-2">
      <Link href="/dashboard" className="text-sm text-blue-700 underline">← Back</Link>
      <h1 className="mt-2 text-xl font-semibold">{visit!.visit_id}</h1>
      <p className="text-sm text-slate-500">
        {new Date(visit!.visit_date).toLocaleDateString()} · {visit!.status}
      </p>

      <div className="mt-3">
        <a
          href={`/api/reports/${visit!.id}`}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded"
        >
          Download PDF
        </a>
      </div>

      <div className="mt-6 space-y-4">
        {(vts ?? []).map((vt) => {
          const params = paramsByTest.get(vt.test_id) ?? [];
          const rs = resultsByVisitTest.get(vt.id) ?? [];
          const test = Array.isArray(vt.tests) ? vt.tests[0] : vt.tests;
          return (
            <div key={vt.id} className="bg-white border rounded p-3">
              <h3 className="font-medium">{test?.name ?? "Test"}</h3>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {params.map((p) => {
                    const r = rs.find((x) => x.parameter_id === p.id);
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="py-1.5">{p.name}</td>
                        <td className={`py-1.5 font-medium ${r?.is_abnormal ? "text-red-700" : ""}`}>
                          {r?.value ?? "—"}
                        </td>
                        <td className="py-1.5 text-xs text-slate-500">{p.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
