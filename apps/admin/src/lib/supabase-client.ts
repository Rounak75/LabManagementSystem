import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Returns a Supabase client authenticated with the user's JWT (server-side use). */
export function getServerSupabase(jwt: string) {
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous client (very rare — only for public endpoints if any). */
export function getAnonSupabase() {
  return createClient(URL, ANON, { auth: { persistSession: false } });
}
