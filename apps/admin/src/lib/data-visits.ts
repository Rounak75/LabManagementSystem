import { unstable_cache } from "next/cache";
import { getServerSupabase } from "./supabase-client";
import { CACHE_TAGS } from "./cache-tags";

const _listVisits = unstable_cache(
  async (jwt: string, opts?: { status?: string; patientId?: string }) => {
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
  },
  ["visits-list"],
  { tags: [CACHE_TAGS.visits], revalidate: 60 },
);

export function listVisits(jwt: string, opts?: { status?: string; patientId?: string }) {
  return _listVisits(jwt, opts);
}

const _listPendingVerifyVisits = unstable_cache(
  async (jwt: string) => {
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
  },
  ["visits-pending-verify"],
  { tags: [CACHE_TAGS.visits], revalidate: 60 },
);

export function listPendingVerifyVisits(jwt: string) {
  return _listPendingVerifyVisits(jwt);
}

const _countPendingVerify = unstable_cache(
  async (jwt: string): Promise<number> => {
    const sb = getServerSupabase(jwt);
    const { count, error } = await sb
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("status", "PendingVerify")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  ["visits-pending-count"],
  { tags: [CACHE_TAGS.visits], revalidate: 60 },
);

export function countPendingVerify(jwt: string): Promise<number> {
  return _countPendingVerify(jwt);
}

const _getVisit = unstable_cache(
  async (jwt: string, id: string) => {
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
  },
  ["visit-detail"],
  { tags: [CACHE_TAGS.visits], revalidate: 60 },
);

export function getVisit(jwt: string, id: string) {
  return _getVisit(jwt, id);
}
