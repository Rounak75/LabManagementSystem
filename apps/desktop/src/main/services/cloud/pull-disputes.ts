import { logger } from "./logger";
// Phase 3d Plan F — pull portal-filed disputes into local SQLite and fire the
// staff alert email for each new one. Mirrors pull-bookings: a SyncCursor
// keyed by source="disputes" tracks the last created_at we ingested.

import { prisma } from "@main/db";
import type { CloudClient } from "./sync-engine";
import { runPull } from "./pull-runner";
import * as triggers from "@main/services/notifications/triggers";

const SOURCE = "disputes";
const BATCH = 50;

interface RawDisputeRow extends Record<string, unknown> {
  id: string;
  patient_id: string;
  reason: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;

  resolution_note: string | null;
}

export async function pullDisputes(client: CloudClient): Promise<void> {
  // Driven by the shared runner rather than its own loop. The hand-rolled version
  // rethrew any error that was not a constraint conflict, which skipped the
  // cursor write — so the next tick re-fetched the same page, hit the same row
  // and threw again, indefinitely. One malformed dispute stopped every later one
  // from reaching the lab PC, and a dispute is a patient saying these results are
  // not mine: the one message that must not go unseen.
  await runPull<RawDisputeRow>(client, {
    source: SOURCE,
    table: "disputes",
    cursorColumn: "created_at",
    batchSize: BATCH,

    applyRow: async (r) => {
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

      await prisma().dispute.upsert({ where: { id: r.id }, create: data, update: data });

      // Best-effort — a mail failure must not hold up the dispute itself.
      if (!existing) {
        triggers.portalDispute(r.id).catch((e) =>
          logger.error("cloud", "[pull-disputes] portalDispute trigger failed", e),
        );
      }
    },
  });
}
