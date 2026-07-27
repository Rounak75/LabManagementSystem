import { logger } from "./logger";
// Phase 3e Plan A — pull verification events: visits whose verified_at + verified_by_user_id
// advanced in the cloud (e.g. father tapped Verify in the admin portal).
//
// Phase 3e Plan E — these must reach the same end-state as the desktop's own
// verify-lock handler (visits.ipc `visitTests:lock`): lock every VisitTest, mark
// it Ready, flip the Visit to Completed, and fire the ReportReady patient
// notification exactly once. Idempotent — a visit already fully locked is skipped,
// so re-running never re-notifies.

import { prisma } from "@main/db";
import type { CloudClient } from "./sync-engine";
import * as triggers from "@main/services/notifications/triggers";

const SOURCE = "verifications";
const BATCH = 100;

interface RawVerificationRow {
  id: string;
  visit_id: string;
  source: string;
  verified_by_user_id: string | null;
  verified_at: string | null;
  updated_at: string;
}

export async function pullVerifications(client: CloudClient): Promise<void> {
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  let rows: RawVerificationRow[] = [];
  try {
    rows = (await client.pullSince("visits", "verified_at", sinceIso, BATCH, { source: "admin" }, lastId)) as unknown as RawVerificationRow[];
  } catch (e) {
    logger.error("cloud", "[pull-verifications] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;
  for (const r of rows) {
    try {
      if (!r.verified_at) continue;

      const local = await prisma().visit.findUnique({ where: { id: r.id } });
      if (!local) {
        latest = new Date(r.verified_at);
        latestId = r.id;
        continue;
      }

      const tests = await prisma().visitTest.findMany({ where: { visitId: r.id } });
      if (tests.length === 0) {
        latest = new Date(r.verified_at);
        latestId = r.id;
        continue;
      }

      // Idempotent guard: already fully locked-and-verified → nothing to do.
      if (tests.every((t) => t.isLocked && t.verifiedAt)) {
        latest = new Date(r.verified_at);
        latestId = r.id;
        continue;
      }

      // Mirror the desktop verify-lock end-state.
      await prisma().visitTest.updateMany({
        where: { visitId: r.id },
        data: {
          verifiedAt: new Date(r.verified_at),
          verifiedById: r.verified_by_user_id ?? null,
          isLocked: true,
          status: "Ready",
        },
      });
      await prisma().visit.update({ where: { id: r.id }, data: { status: "Completed" } });

      // Fire the patient ReportReady notification once, on the verify transition.
      try {
        await triggers.reportReady(r.id);
      } catch (e) {
        logger.error("cloud", "[pull-verifications] reportReady trigger failed", e);
      }

      // Success -> advance cursor
      latest = new Date(r.verified_at!);
      latestId = r.id;
    } catch (e: any) {
      if (e?.code === "P2002" || e?.code === "P2003") {
        logger.warn("cloud", "[pull-verifications] skipping row" + " " + r.id + " " + "— constraint conflict:" + " " + JSON.stringify(e.meta));
        // Skipped constraint conflict -> advance cursor
        latest = new Date(r.verified_at!);
        latestId = r.id;
        continue;
      }
      logger.error("cloud", "[pull-verifications] row" + " " + r.id + " " + "failed", e);
      throw e;
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest, lastId: latestId },
    create: { source: SOURCE, lastSyncedAt: latest, lastId: latestId },
  });
}
