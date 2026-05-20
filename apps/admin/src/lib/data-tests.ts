import { unstable_cache } from "next/cache";
import { getServerSupabase } from "./supabase-client";

// Tests have no write path in the admin app; cache longer with time-based
// revalidation only.
const _listActiveTests = unstable_cache(
  async (jwt: string) => {
    const sb = getServerSupabase(jwt);
    const { data, error } = await sb
      .from("tests")
      .select("id, name, category, price, is_active, collection_time_restriction")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["tests-active"],
  { revalidate: 300 },
);

export function listActiveTests(jwt: string) {
  return _listActiveTests(jwt);
}
