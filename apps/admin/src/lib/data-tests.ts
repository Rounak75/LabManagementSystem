import { getServerSupabase } from "./supabase-client";

// Fetch active tests directly. 
// Do NOT use unstable_cache globally because Supabase RLS can return [] 
// if an unauthenticated or unauthorized request triggers the cache, 
// which poisons the cache for all valid users for 5 minutes.
export async function listActiveTests(jwt: string) {
  const sb = getServerSupabase(jwt);
  const { data, error } = await sb
    .from("tests")
    .select("id, name, category, price, is_active, collection_time_restriction")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
