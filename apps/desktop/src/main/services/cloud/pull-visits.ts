// Phase 3e Plan A — pull admin-portal-created visits + their VisitTests into
// local SQLite. visit_tests are a separate cloud table, fetched for the whole
// page at once (not per visit) and materialised as local VisitTest rows. Skips
// desktop-source rows to avoid echoes.

import { prisma } from "@main/db";
import { logger } from "./logger";
import { runPull } from "./pull-runner";
import type { CloudClient } from "./sync-engine";

const SOURCE = "visits";

interface RawVisitRow extends Record<string, unknown> {
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

export async function pullVisits(client: CloudClient): Promise<void> {
  // Children for every visit in the page, keyed by visit id. Populated by
  // `prepare` so a page costs one extra query rather than one per visit.
  let childrenByVisit = new Map<string, RawVisitTestRow[]>();

  await runPull<RawVisitRow>(client, {
    source: SOURCE,
    table: "visits",
    cursorColumn: "updated_at",

    prepare: async (rows) => {
      childrenByVisit = new Map();
      const visitIds = rows.map((r) => r.id);
      if (visitIds.length === 0) return;

      try {
        const all = (await client.fetchVisitTestsForVisits(
          visitIds,
        )) as unknown as RawVisitTestRow[];
        for (const vt of all) {
          const list = childrenByVisit.get(vt.visit_id) ?? [];
          list.push(vt);
          childrenByVisit.set(vt.visit_id, list);
        }
      } catch (e) {
        // Non-fatal: the visits themselves still apply, and their children are
        // re-fetched on the next tick.
        logger.error("cloud", "[pull-visits] fetch visit_tests batch failed", e);
      }
    },

    shouldApply: (r) => r.source === "admin" && !r.deleted_at,

    applyRow: async (r) => {
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

      await prisma().visit.upsert({ where: { id: r.id }, create: data, update: data });

      for (const vt of childrenByVisit.get(r.id) ?? []) {
        await prisma().visitTest.upsert({
          where: { id: vt.id },
          create: {
            id: vt.id,
            visitId: r.id,
            testId: vt.test_id,
            status: vt.status ?? "Collected",
          },
          update: { status: vt.status ?? "Collected" },
        });
      }
    },
  });
}
