import { logger } from "./logger";
// Phase 3d Plan F — pull portal-filed disputes into local SQLite and fire the
// staff alert email for each new one. Mirrors pull-bookings: a SyncCursor
// keyed by source="disputes" tracks the last created_at we ingested.

import { prisma } from "@main/db";
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

export async function pullDisputes(client: any): Promise<void> {
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  let rows: RawDisputeRow[] = [];
  try {
    rows = (await client.pullSince("disputes", "created_at", sinceIso, BATCH, undefined, lastId)) as unknown as RawDisputeRow[];
  } catch (e) {
    logger.error("cloud", "[pull-disputes] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;
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
          logger.error("cloud", "[pull-disputes] portalDispute trigger failed", e),
        );
      }

      // Success -> advance cursor
      latest = new Date(r.created_at);
      latestId = r.id;
    } catch (e: any) {
      if (e?.code === "P2002" || e?.code === "P2003") {
        logger.warn("cloud", "[pull-disputes] skipping row" + " " + r.id + " " + "— constraint conflict:" + " " + JSON.stringify(e.meta));
        // Skipped constraint conflict -> advance cursor
        latest = new Date(r.created_at);
        latestId = r.id;
        continue;
      }
      logger.error("cloud", "[pull-disputes] row" + " " + r.id + " " + "failed", e);
      throw e;
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest, lastId: latestId },
    create: { source: SOURCE, lastSyncedAt: latest, lastId: latestId },
  });
}
