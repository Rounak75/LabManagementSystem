// Phase 3e Plan A — pull admin-portal-created patients into local SQLite.
// Mirrors pull-bookings.ts. Skips rows where source != 'admin' to avoid
// echoing back our own outbox-pushed rows.

import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";

const SOURCE = "patients";
const BATCH = 100;

interface RawPatientRow {
  id: string;
  patient_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  age: number;
  sex: string;
  address: string | null;
  source: string;
  referred_by_id: string | null;
  created_by_id: string | null;
  portal_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function pullPatients(): Promise<void> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.cloudSyncEnabled) return;
  if (!s.supabaseUrl || !s.supabaseAnonKey || !s.supabaseServiceKey) return;

  const client = createSupabaseClient({
    url: s.supabaseUrl,
    serviceKey: decryptSecret(s.supabaseServiceKey),
    anonKey: s.supabaseAnonKey,
  });

  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();

  let rows: RawPatientRow[] = [];
  try {
    rows = (await client.fetchPatientsSince(sinceIso, BATCH)) as unknown as RawPatientRow[];
  } catch (e) {
    console.error("[pull-patients] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  for (const r of rows) {
    try {
      const rowUpdated = new Date(r.updated_at);
      if (rowUpdated > latest) latest = rowUpdated;

      // Skip rows we originated — they came from desktop's own outbox push.
      if (r.source !== "admin") continue;

      const data = {
        id: r.id,
        patientId: r.patient_id,
        name: r.name,
        phone: r.phone ?? null,
        email: r.email ?? null,
        age: r.age,
        sex: r.sex,
        address: r.address ?? null,
        referredById: r.referred_by_id ?? null,
        portalAccountId: r.portal_account_id ?? null,
        createdById: r.created_by_id ?? "",
        createdAt: new Date(r.created_at),
      };

      await prisma().patient.upsert({
        where: { id: r.id },
        create: data,
        update: data,
      });
    } catch (e) {
      console.error("[pull-patients] row", r.patient_id, "failed", e);
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest },
    create: { source: SOURCE, lastSyncedAt: latest },
  });
}
