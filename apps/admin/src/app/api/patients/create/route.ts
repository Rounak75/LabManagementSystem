import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getServerSupabase } from "@/lib/supabase-client";
import { callReserveVisitId } from "@/lib/edge-function";
import { patientCreateSchema } from "@lab/types";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = patientCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sb = getServerSupabase(user.token);

  // Allocate LAB-YYYY-NNNNN via the cloud-authoritative Edge Function.
  let patientId: string;
  try {
    const alloc = await callReserveVisitId(user.token, "LAB", new Date().getUTCFullYear(), user.id);
    patientId = alloc.allocatedId;
  } catch {
    return NextResponse.json({ error: "id_alloc_failed" }, { status: 502 });
  }

  const { data, error } = await sb
    .from("patients")
    .insert({
      id: crypto.randomUUID(),
      patient_id: patientId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      age: parsed.data.age,
      sex: parsed.data.sex,
      address: parsed.data.address || null,
      created_by_id: user.id,
      source: "admin",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort audit trail.
  await sb
    .from("audit_logs")
    .insert({
      user_id: user.id,
      action: "patient.create",
      target_entity: "patients",
      target_id: data.id,
      details: JSON.stringify({ patient_id: patientId, name: parsed.data.name }),
    })
    .then(undefined, () => {});

  return NextResponse.json({ id: data.id, patient_id: patientId });
}
