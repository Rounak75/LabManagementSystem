// Phase 3d Plan F — pull portal-filed disputes into local SQLite and fire the
// staff alert email for each new one. Mirrors pull-bookings: a SyncCursor
// keyed by source="disputes" tracks the last created_at we ingested.

import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";
import * as triggers from "@main/services/notifications/triggers";

const SOURCE = "disputes";
const BATCH = 50;

interface RawDisputeRow {
  id: string;
  patient_id: string;
  reason: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  resolution_note: string | null;
}

export async function pullDisputes(): Promise<void> {
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

  let rows: RawDisputeRow[] = [];
  try {
    rows = (await client.fetchDisputesSince(sinceIso, BATCH)) as unknown as RawDisputeRow[];
  } catch (e) {
    console.error("[pull-disputes] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  for (const r of rows) {
    try {
      const existing = await prisma().dispute.findUnique({ where: { id: r.id } });

      const data = {
        id: r.id,
        patientId: r.patient_id,
        reason: r.reason,
        status: r.status,
        createdAt: new Date(r.created_at),
        resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
        resolvedByUserId: r.resolved_by_user_id ?? null,
        resolutionNote: r.resolution_note ?? null,
      };

      await prisma().dispute.upsert({
        where: { id: r.id },
        create: data,
        update: data,
      });

      if (!existing) {
        triggers.portalDispute(r.id).catch((e) =>
          console.error("[pull-disputes] portalDispute trigger failed", e),
        );
      }

      const created = new Date(r.created_at);
      if (created > latest) latest = created;
    } catch (e) {
      console.error("[pull-disputes] row", r.id, "failed", e);
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest },
    create: { source: SOURCE, lastSyncedAt: latest },
  });
}
