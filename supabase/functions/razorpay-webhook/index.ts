import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyHmac } from "./signature.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

async function logWebhook(status: string, payload?: string, error?: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  await supabase.from("webhook_log").insert({ status, payload, error });
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";

  if (!WEBHOOK_SECRET) {
    await logWebhook("config_error", raw, "RAZORPAY_WEBHOOK_SECRET not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  const ok = await verifyHmac(raw, sig, WEBHOOK_SECRET);
  if (!ok) {
    await logWebhook("invalid_signature", raw);
    return new Response("Invalid signature", { status: 401 });
  }

  let body: { event?: string; id?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    await logWebhook("invalid_json", raw);
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId = req.headers.get("x-razorpay-event-id") ?? body.id ?? crypto.randomUUID();
  const event = body.event ?? "unknown";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { error } = await supabase.from("payment_events").insert({
    event_id: eventId,
    event,
    razorpay_payload: body,
    received_at: new Date().toISOString(),
  });

  if (error && error.code !== "23505") {
    await logWebhook("insert_failed", raw, error.message);
    return new Response("Insert failed", { status: 500 });
  }

  await logWebhook("accepted", raw);
  return new Response("ok", { status: 200 });
});
