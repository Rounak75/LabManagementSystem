// Phase 3e Plan A — pull admin-portal-created visits + their VisitTests into
// local SQLite. visit_tests are a separate cloud table, fetched per-visit and
// materialised as local VisitTest rows. Skips desktop-source rows to avoid
// echoes.

import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";

const SOURCE = "visits";
const BATCH = 100;

interface RawVisitRow {
  id: string;
  visit_id: string;
  patient_id: string;
  type: string;
  visit_date: string;
  status: string;
  staff_id: string;
  access_code_hash: string | null;
  source: string;
  verified_by_user_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RawVisitTestRow {
  id: string;
  visit_id: string;
  test_id: string;
  status: string | null;
}

export async function pullVisits(): Promise<void> {
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

  let rows: RawVisitRow[] = [];
  try {
    rows = (await client.fetchVisitsSince(sinceIso, BATCH)) as unknown as RawVisitRow[];
  } catch (e) {
    console.error("[pull-visits] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  for (const r of rows) {
    try {
      const rowUpdated = new Date(r.updated_at);
      if (rowUpdated > latest) latest = rowUpdated;

      if (r.source !== "admin") continue;

      const data = {
        id: r.id,
        visitId: r.visit_id,
        patientId: r.patient_id,
        type: r.type,
        visitDate: new Date(r.visit_date),
        status: r.status,
        staffId: r.staff_id,
        accessCodeHash: r.access_code_hash ?? null,
        createdAt: new Date(r.created_at),
      };

      await prisma().visit.upsert({
        where: { id: r.id },
        create: data,
        update: data,
      });

      // Materialise child VisitTest rows from the separate cloud visit_tests
      // table, keyed by their own ids so re-pulls upsert cleanly.
      let vtRows: RawVisitTestRow[] = [];
      try {
        vtRows = (await client.fetchVisitTestsForVisit(r.id)) as unknown as RawVisitTestRow[];
      } catch (e) {
        console.error("[pull-visits] fetch visit_tests for", r.visit_id, "failed", e);
      }
      for (const vt of vtRows) {
        await prisma().visitTest.upsert({
          where: { id: vt.id },
          create: {
            id: vt.id,
            visitId: r.id,
            testId: vt.test_id,
            status: vt.status ?? "Collected",
          },
          update: {
            status: vt.status ?? "Collected",
          },
        });
      }
    } catch (e) {
      console.error("[pull-visits] row", r.visit_id, "failed", e);
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest },
    create: { source: SOURCE, lastSyncedAt: latest },
  });
}
