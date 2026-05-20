import { getServerSupabase } from "./supabase-client";

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
