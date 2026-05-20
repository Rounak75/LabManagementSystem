import { getServerSupabase } from "./supabase-client";

export async function listVisits(jwt: string, opts?: { status?: string; patientId?: string }) {
  const sb = getServerSupabase(jwt);
  let q = sb
    .from("visits")
    .select("id, visit_id, visit_date, status, source, patient_id, patients(name, phone, patient_id)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.patientId) q = q.eq("patient_id", opts.patientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPendingVerifyVisits(jwt: string) {
  const sb = getServerSupabase(jwt);
  const { data, error } = await sb
    .from("visits")
    .select(`
      id, visit_id, visit_date,
      patients(name, phone, patient_id, age, sex),
      visit_tests(id, tests(name), results(value, is_abnormal, parameter_id))
    `)
    .eq("status", "PendingVerify")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countPendingVerify(jwt: string): Promise<number> {
  const sb = getServerSupabase(jwt);
  const { count, error } = await sb
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("status", "PendingVerify")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getVisit(jwt: string, id: string) {
  const sb = getServerSupabase(jwt);
  const { data, error } = await sb
    .from("visits")
    .select(`
      *,
      patients(*),
      visit_tests(*, tests(name, parameters(*)))
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
