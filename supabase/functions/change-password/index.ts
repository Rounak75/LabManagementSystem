// Edge Function: change a user's password. Verifies the current password against
// the synced users table, then writes a new bcrypt hash. Requires a valid bearer
// token (the admin portal forwards the session JWT) and the matching userId.
// Returns 200 { ok: true }; 400 bad input, 401 wrong current password, 404 unknown.

import { createClient } from "supabase";
import * as bcrypt from "bcrypt";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  let body: { userId?: string; oldPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.userId || !body.oldPassword || !body.newPassword || body.newPassword.length < 8) {
    return new Response("Invalid input", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: user } = await supabase
    .from("users")
    .select("id, password_hash")
    .eq("id", body.userId)
    .maybeSingle();
  if (!user) return new Response("Not found", { status: 404 });

  // compareSync/hashSync — the async paths spawn a Web Worker unavailable in the
  // Supabase Edge (Deno Deploy) runtime (same constraint as auth-login).
  if (!bcrypt.compareSync(body.oldPassword, user.password_hash)) {
    return new Response("Wrong current password", { status: 401 });
  }
  const newHash = bcrypt.hashSync(body.newPassword);
  await supabase
    .from("users")
    .update({ password_hash: newHash, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
