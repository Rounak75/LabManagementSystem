// Prints the reports queued from the staff portal.
//
// Tapping Print in the staff portal writes a PrintJob and tells the user
// "Queued for printing". The desktop pulled that job and moved it to Picked —
// and then nothing. No code anywhere rendered or printed it, so the job sat at
// Picked forever while the portal claimed success, and the reports had to be
// found and printed by hand at the desk. Done and Failed were declared on the
// model and never reached.
//
// This is the missing half: claim Picked jobs, render each report with the same
// template the desk would use, print it silently to the default printer, and
// record what happened. Because PrintJob is a synced model, Done and Failed
// travel back to the cloud on the ordinary outbox push, so the portal can stop
// saying "Queued" and show what actually became of it.

import { prisma } from "@main/db";
import { buildReportData } from "@main/services/report.service";
import { renderReportPdf } from "@main/services/pdf.service";
import { printPdfBuffer } from "@main/services/print.service";
import { resolveTemplateConfig } from "@main/services/template-resolver";
import { audit } from "@main/services/audit-best-effort";
import { logger } from "@main/services/cloud/logger";

/** How often the queue is checked. */
export const PRINT_TICK_MS = 15_000;

/**
 * A queued job older than this is dropped rather than printed.
 *
 * The queue can sit unattended for days — the lab PC is off overnight and may be
 * off for a holiday. Without this, turning the machine on after a week would
 * push every request made in that week to the printer at once. A week-old
 * request has almost certainly been dealt with on paper already, so the safe
 * reading of an old job is "no longer wanted".
 */
export const MAX_JOB_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** How many jobs one tick will print, so a backlog cannot monopolise the app. */
export const MAX_JOBS_PER_TICK = 10;

export interface PrintQueueStats {
  printed: number;
  failed: number;
  expired: number;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Processes one batch of queued print jobs.
 *
 * Jobs are printed one at a time on purpose. A printer is a single physical
 * resource, and two Electron print windows racing it interleave pages across
 * reports — the failure mode is a stack of paper that has to be sorted by hand.
 */
export async function runPrintQueueTick(): Promise<PrintQueueStats> {
  const stats: PrintQueueStats = { printed: 0, failed: 0, expired: 0 };
  if (running) return stats;
  running = true;

  try {
    const jobs = await prisma().printJob.findMany({
      where: { status: "Picked" },
      orderBy: { requestedAt: "asc" },
      take: MAX_JOBS_PER_TICK,
    });
    if (jobs.length === 0) return stats;

    const now = Date.now();

    for (const job of jobs) {
      if (now - new Date(job.requestedAt).getTime() > MAX_JOB_AGE_MS) {
        await prisma().printJob.update({
          where: { id: job.id },
          data: {
            status: "Failed",
            completedAt: new Date(),
            errorMessage: "Expired — this print was requested more than a week ago.",
          },
        });
        stats.expired += 1;
        continue;
      }

      try {
        const data = await buildReportData(job.visitId);
        const config = await resolveTemplateConfig();
        const buffer = await renderReportPdf(data, config);

        // Silent: there is nobody at the machine to dismiss a print dialog, and
        // a modal would stall every job behind this one.
        await printPdfBuffer(buffer, { silent: true });

        await prisma().printJob.update({
          where: { id: job.id },
          data: { status: "Done", completedAt: new Date(), errorMessage: null },
        });
        stats.printed += 1;

        await audit.try("PRINT", {
          entityType: "Visit",
          entityId: job.visitId,
          userId: job.requestedById,
          details: { printJobId: job.id, queued: true },
        });
      } catch (e) {
        // Marked Failed and left alone rather than retried. Printing is not
        // idempotent: a job that failed partway has already put paper in the
        // tray, and retrying it produces a duplicate or a half report on top of
        // a good one. The owner can see the reason and re-queue deliberately.
        await prisma().printJob.update({
          where: { id: job.id },
          data: { status: "Failed", completedAt: new Date(), errorMessage: describe(e).slice(0, 500) },
        });
        stats.failed += 1;
        logger.error("print-queue", `print job ${job.id} failed`, e);
      }
    }

    if (stats.printed || stats.failed || stats.expired) {
      logger.info("print-queue", "print queue tick completed", { ...stats });
    }
    return stats;
  } finally {
    running = false;
  }
}

export function startPrintQueueWorker(): void {
  if (timer) return;
  // A self-scheduling timeout rather than setInterval, so a slow print (a large
  // report, or a printer that takes its time) can never overlap the next tick.
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        await runPrintQueueTick();
      } catch (e) {
        logger.error("print-queue", "print queue tick threw", e);
      }
      if (timer) schedule();
    }, PRINT_TICK_MS);
  };
  schedule();
}

export function stopPrintQueueWorker(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
