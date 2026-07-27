import { logger } from "./logger";
// Phase 3e Plan A — pull Queued PrintJob rows from cloud and immediately
// move them to Picked locally. Because PrintJob is in SYNCED_MODELS, the local
// upsert fires the outbox push that flips the cloud row to Picked too — no
// manual cloud write needed. The desktop's print pipeline (separate module,
// added later) reads Picked jobs from local SQLite and prints them.

import { prisma } from "@main/db";
import type { CloudClient } from "./sync-engine";

const SOURCE = "print_jobs";
const BATCH = 100;

interface RawPrintJobRow {
  id: string;
  visit_id: string;
  requested_by_id: string;
  requested_at: string;
  status: string;
  picked_up_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export async function pullPrintJobs(client: CloudClient): Promise<void> {
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  let rows: RawPrintJobRow[] = [];
  try {
    rows = (await client.pullSince("print_jobs", "requested_at", sinceIso, BATCH, { status: "Queued" }, lastId)) as unknown as RawPrintJobRow[];
  } catch (e) {
    logger.error("cloud", "[pull-print-jobs] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;
  const now = new Date();
  for (const r of rows) {
    try {
      latest = new Date(r.requested_at);
      latestId = r.id;

      const existing = await prisma().printJob.findUnique({ where: { id: r.id } });
      if (existing && existing.status !== "Queued") {
        // Already in a non-Queued state locally; don't reset.
        continue;
      }

      await prisma().printJob.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          visitId: r.visit_id,
          requestedById: r.requested_by_id,
          requestedAt: new Date(r.requested_at),
          status: "Picked",
          pickedUpAt: now,
        },
        update: {
          status: "Picked",
          pickedUpAt: now,
        },
      });
      
      // Success -> advance cursor
      latest = new Date(r.requested_at);
      latestId = r.id;
    } catch (e: any) {
      if (e?.code === "P2002" || e?.code === "P2003") {
        logger.warn("cloud", "[pull-print-jobs] skipping row" + " " + r.id + " " + "— constraint conflict:" + " " + JSON.stringify(e.meta));
        // Skipped constraint conflict -> advance cursor
        latest = new Date(r.requested_at);
        latestId = r.id;
        continue;
      }
      logger.error("cloud", "[pull-print-jobs] row" + " " + r.id + " " + "failed", e);
      throw e;
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest, lastId: latestId },
    create: { source: SOURCE, lastSyncedAt: latest, lastId: latestId },
  });
}
