// Phase 3e Plan A — pull verification events: visits whose verified_at +
// verified_by_user_id advanced in the cloud (e.g. the owner tapped Verify in the
// admin portal).
//
// Phase 3e Plan E — these must reach the same end-state as the desktop's own
// verify-lock handler (visits.ipc `visitTests:lock`): lock every VisitTest, mark
// it Ready, flip the Visit to Completed, and fire the ReportReady patient
// notification exactly once. Idempotent — a visit already fully locked is
// skipped, so re-running never re-notifies.

import { prisma } from "@main/db";
import { logger } from "./logger";
import { runPull } from "./pull-runner";
import type { CloudClient } from "./sync-engine";
import * as triggers from "@main/services/notifications/triggers";

const SOURCE = "verifications";

interface RawVerificationRow extends Record<string, unknown> {
  id: string;
  visit_id: string;
  source: string;
  verified_by_user_id: string | null;
  verified_at: string | null;
  updated_at: string;
}

export async function pullVerifications(client: CloudClient): Promise<void> {
  await runPull<RawVerificationRow>(client, {
    source: SOURCE,
    table: "visits",
    cursorColumn: "verified_at",
    filters: { source: "admin" },
    shouldApply: (r) => !!r.verified_at,

    applyRow: async (r) => {
      const verifiedAt = new Date(r.verified_at!);

      // Throw rather than return when the visit or its tests have not arrived
      // yet. Returning counted the row as applied, so the cursor moved past this
      // verification and no later tick ever looked at it again — the comment
      // promising otherwise was wrong. The visit stayed unverified on the lab PC,
      // never reached the Reports list to be printed, and the patient was never
      // told their report was ready. Throwing retries while the visits stream
      // catches up, then quarantines the row in SyncDeadLetter where it is
      // visible and replayable.
      const local = await prisma().visit.findUnique({ where: { id: r.id } });
      if (!local) {
        throw new Error(`visit ${r.id} not synced yet for verification`);
      }

      const tests = await prisma().visitTest.findMany({ where: { visitId: r.id } });
      if (tests.length === 0) {
        throw new Error(`visit ${r.id} has no local tests yet for verification`);
      }

      // Idempotent guard: already fully locked-and-verified → nothing to do.
      if (tests.every((t) => t.isLocked && t.verifiedAt)) return;

      // Mirror the desktop verify-lock end-state.
      await prisma().visitTest.updateMany({
        where: { visitId: r.id },
        data: {
          verifiedAt,
          verifiedById: r.verified_by_user_id ?? null,
          isLocked: true,
          status: "Ready",
        },
      });
      await prisma().visit.update({ where: { id: r.id }, data: { status: "Completed" } });

      // Fire the patient ReportReady notification once, on the verify transition.
      // A failure here must not undo the lock or re-run it next tick.
      try {
        await triggers.reportReady(r.id);
      } catch (e) {
        logger.error("cloud", "[pull-verifications] reportReady trigger failed", e);
      }
    },
  });
}
