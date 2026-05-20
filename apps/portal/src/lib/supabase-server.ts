// Supabase clients for the portal's server-side code only.
// Service role = bypasses RLS, used for auth flows where we need to look up
// a patient before we have a JWT. Anon = goes through RLS using the patient's JWT.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getAnonClient(jwt?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}
