import { unstable_cache } from "next/cache";
import { getServerSupabase } from "./supabase-client";
import { CACHE_TAGS } from "./cache-tags";

export interface PatientListItem {
  id: string;
  patient_id: string | null;
  name: string;
  phone: string | null;
  age: number | null;
  sex: string | null;
}

const _listPatients = unstable_cache(
  async (jwt: string, query?: string): Promise<PatientListItem[]> => {
    const sb = getServerSupabase(jwt);
    let q = sb
      .from("patients")
      .select("id, patient_id, name, phone, age, sex")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (query) {
      q = q.or(`name.ilike.%${query}%,phone.ilike.%${query}%,patient_id.ilike.%${query}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as PatientListItem[];
  },
  ["patients-list"],
  { tags: [CACHE_TAGS.patients], revalidate: 60 },
);

export function listPatients(jwt: string, query?: string): Promise<PatientListItem[]> {
  return _listPatients(jwt, query);
}

const _getPatient = unstable_cache(
  async (jwt: string, id: string) => {
    const sb = getServerSupabase(jwt);
    const { data, error } = await sb.from("patients").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  ["patient-detail"],
  { tags: [CACHE_TAGS.patients], revalidate: 60 },
);

export function getPatient(jwt: string, id: string) {
  return _getPatient(jwt, id);
}
