// Edge Function: atomically reserve the next sequential VIS-YYYY-NNNNN.
// Requires: { kind: "VIS" | "LAB", year: number, userId: string } body.
// Returns: { reservationId: string, allocatedId: string } on 200.
//   400 on bad input, 401 if no JWT, 500 on db error.

import { createClient } from "supabase";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { kind?: string; year?: number; userId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (body.kind !== "VIS" && body.kind !== "LAB") {
    return new Response("Invalid kind", { status: 400 });
  }
  if (!body.year || body.year < 2000 || body.year > 2100) {
    return new Response("Invalid year", { status: 400 });
  }
  if (!body.userId) {
    return new Response("Missing userId", { status: 400 });
  }

  const prefix = `${body.kind}-${body.year}-`;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Race-safe loop (up to 20 retries on unique violation).
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: maxRow, error: maxErr } = await supabase
      .from("id_reservations")
      .select("number")
      .eq("prefix", prefix)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) return new Response(`db read: ${maxErr.message}`, { status: 500 });

    const next = (maxRow?.number ?? 0) + 1;
    const { data: ins, error: insErr } = await supabase
      .from("id_reservations")
      .insert({
        prefix,
        number: next,
        reserved_by: body.userId,
        source: "admin",
      })
      .select("id")
      .single();

    if (insErr) {
      // Unique violation = race; retry.
      if (insErr.code === "23505") continue;
      return new Response(`db insert: ${insErr.message}`, { status: 500 });
    }

    const allocated = `${prefix}${String(next).padStart(5, "0")}`;
    return new Response(
      JSON.stringify({ reservationId: ins.id, allocatedId: allocated }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response("Too many races", { status: 500 });
});
