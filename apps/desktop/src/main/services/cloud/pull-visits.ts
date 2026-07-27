import { logger } from "./logger";
// Phase 3e Plan A — pull admin-portal-created visits + their VisitTests into
// local SQLite. visit_tests are a separate cloud table, fetched per-visit and
// materialised as local VisitTest rows. Skips desktop-source rows to avoid
// echoes.

import { prisma } from "@main/db";

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
  deleted_at?: string | null;
}

interface RawVisitTestRow {
  id: string;
  visit_id: string;
  test_id: string;
  status: string | null;
}

export async function pullVisits(client: any): Promise<void> {
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  let rows: RawVisitRow[] = [];
  try {
    rows = (await client.pullSince("visits", "updated_at", sinceIso, BATCH, undefined, lastId)) as unknown as RawVisitRow[];
  } catch (e) {
    logger.error("cloud", "[pull-visits] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;
  
  // Phase 3e Plan A: Fix N+1 — fetch all visit_tests for this batch of visits at once
  const visitIds = rows.map((r) => r.id);
  let allVisitTests: RawVisitTestRow[] = [];
  if (visitIds.length > 0) {
    try {
      // We need a new method on client for this, or just use pullSince / select with IN
      allVisitTests = (await client.fetchVisitTestsForVisits(visitIds)) as unknown as RawVisitTestRow[];
    } catch (e) {
      logger.error("cloud", "[pull-visits] fetch visit_tests batch failed", e);
    }
  }

  for (const r of rows) {
    try {
      if (r.deleted_at) {
        latest = new Date(r.updated_at);
        latestId = r.id;
        continue;
      }
      if (r.source === "admin") {
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
        const vtRows = allVisitTests.filter((vt) => vt.visit_id === r.id);
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
      }

      // Success or skipped (not admin) -> advance cursor
      latest = new Date(r.updated_at);
      latestId = r.id;
    } catch (e: any) {
      if (e?.code === "P2002" || e?.code === "P2003") {
        logger.warn("cloud", "[pull-visits] skipping row" + " " + r.visit_id + " " + "— constraint conflict:" + " " + JSON.stringify(e.meta));
        // Skipped constraint conflict -> advance cursor
        latest = new Date(r.updated_at);
        latestId = r.id;
        continue;
      }
      logger.error("cloud", "[pull-visits] row" + " " + r.visit_id + " " + "failed", e);
      throw e;
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest, lastId: latestId },
    create: { source: SOURCE, lastSyncedAt: latest, lastId: latestId },
  });
}
