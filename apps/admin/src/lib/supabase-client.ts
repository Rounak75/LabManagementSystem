import { createClient } from "@supabase/supabase-js";

// Read as literals, not through a dynamic key: Next only inlines
// `process.env.NEXT_PUBLIC_*` where it appears verbatim in the source.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * These used to be read with `!`, so a missing variable became the string
 * `"undefined"` and the failure surfaced much later as an unexplained fetch
 * error against a nonsense host. The owner deploying this is non-technical and
 * has no way to work back from that to a missing Vercel setting.
 *
 * Checked at call time rather than at module load, so a build without
 * production environment variables still succeeds; the first real request is
 * what fails, and it says exactly which variable is missing and where to get it.
 */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is not set, so the staff portal cannot reach the database. ` +
        `Set it in the Vercel project's Environment Variables — see apps/admin/.env.example ` +
        `for where to find the value in Supabase.`,
    );
  }
  return value;
}

/** Returns a Supabase client authenticated with the user's JWT (server-side use). */
export function getServerSupabase(jwt: string) {
  return createClient(
    required(URL, "NEXT_PUBLIC_SUPABASE_URL"),
    required(ANON, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Anonymous client (very rare — only for public endpoints if any). */
export function getAnonSupabase() {
  return createClient(
    required(URL, "NEXT_PUBLIC_SUPABASE_URL"),
    required(ANON, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
}
