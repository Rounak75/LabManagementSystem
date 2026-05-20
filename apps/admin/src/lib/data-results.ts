import { getServerSupabase } from "./supabase-client";

export interface ResultParameter {
  id: string;
  test_id: string;
  name: string;
  unit: string | null;
  result_type: "Numeric" | "Qualitative" | null;
  ref_range_male_min: number | null;
  ref_range_male_max: number | null;
  ref_range_female_min: number | null;
  ref_range_female_max: number | null;
  ref_range_child_min: number | null;
  ref_range_child_max: number | null;
  qualitative_options: string | null;
  normal_qualitative: string | null;
  display_order: number | null;
}

export interface ResultRow {
  id: string;
  visit_test_id: string;
  parameter_id: string;
  value: string | null;
  is_abnormal: boolean | null;
  version: number | null;
}

/** Loads a visit, its visit_tests (+ test name), the parameters for those tests,
 *  and any already-entered results. Parameters/results are fetched separately
 *  rather than deeply embedded to keep the PostgREST query simple and robust. */
export async function getVisitForResults(jwt: string, visitId: string) {
  const sb = getServerSupabase(jwt);
  const { data: visit, error } = await sb
    .from("visits")
    .select(`
      id, visit_id, status, visit_date, source, verified_at,
      patients(id, name, phone, age, sex, patient_id),
      visit_tests(id, status, test_id, tests(id, name))
    `)
    .eq("id", visitId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!visit) return null;

  const visitTests = (visit.visit_tests ?? []) as Array<{ id: string; test_id: string }>;
  const testIds = visitTests.map((vt) => vt.test_id);
  const visitTestIds = visitTests.map((vt) => vt.id);

  const parameters: ResultParameter[] = [];
  if (testIds.length > 0) {
    const { data, error: pErr } = await sb.from("parameters").select("*").in("test_id", testIds);
    if (pErr) throw new Error(pErr.message);
    parameters.push(...((data ?? []) as ResultParameter[]));
  }

  const results: ResultRow[] = [];
  if (visitTestIds.length > 0) {
    const { data, error: rErr } = await sb.from("results").select("*").in("visit_test_id", visitTestIds);
    if (rErr) throw new Error(rErr.message);
    results.push(...((data ?? []) as ResultRow[]));
  }

  return { visit, parameters, results };
}
