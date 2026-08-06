// Phase 3e Plan A — pull Queued PrintJob rows from cloud and immediately move
// them to Picked locally. Because PrintJob is in SYNCED_MODELS, the local upsert
// fires the outbox push that flips the cloud row to Picked too — no manual cloud
// write needed. The desktop's print pipeline reads Picked jobs from local SQLite.

import { prisma } from "@main/db";
import { runPull, type PullStats } from "./pull-runner";
import type { CloudClient } from "./sync-engine";

const SOURCE = "print_jobs";

interface RawPrintJobRow extends Record<string, unknown> {
  id: string;
  visit_id: string;
  requested_by_id: string;
  requested_at: string;
  status: string;
  picked_up_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export async function pullPrintJobs(client: CloudClient): Promise<PullStats> {
  return runPull<RawPrintJobRow>(client, {
    source: SOURCE,
    table: "print_jobs",
    cursorColumn: "requested_at",
    filters: { status: "Queued" },

    applyRow: async (r) => {
      const existing = await prisma().printJob.findUnique({ where: { id: r.id } });
      // Already moved on locally (printed, failed); don't reset it to Picked.
      if (existing && existing.status !== "Queued") return;

      const now = new Date();
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
        update: { status: "Picked", pickedUpAt: now },
      });
    },
  });
}
