// Phase 3e Plan A — pull admin-portal-entered TestResult rows into local SQLite.
// Re-runs the local abnormality computation against locally-known parameter
// reference ranges so the report's "Abnormal" flag is authoritative on the
// desktop. Falls back to whatever the cloud row carried if the parameter isn't
// local yet (sync race).

import { prisma } from "@main/db";
import { isAbnormal } from "@main/services/abnormality";
import { audit } from "@main/services/audit-best-effort";
import { logger } from "./logger";
import { runPull } from "./pull-runner";
import type { CloudClient } from "./sync-engine";
import type { ResultType, Sex } from "@lab/types";

const SOURCE = "results";

interface RawResultRow extends Record<string, unknown> {
  id: string;
  visit_test_id: string;
  parameter_id: string;
  value: string;
  is_abnormal: boolean;
  abnormal_override: boolean | null;
  notes: string | null;
  version: number;
  entered_by_user_id: string | null;
  entered_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParameterRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VisitTestRow = any;

export async function pullResults(client: CloudClient): Promise<void> {
  // Parameters and visit tests for the whole page, so abnormality can be
  // recomputed without a query per row.
  let paramsCache = new Map<string, ParameterRow>();
  let vtCache = new Map<string, VisitTestRow>();

  await runPull<RawResultRow>(client, {
    source: SOURCE,
    table: "results",
    cursorColumn: "updated_at",

    prepare: async (rows) => {
      paramsCache = new Map();
      vtCache = new Map();
      const paramIds = Array.from(new Set(rows.map((r) => r.parameter_id)));
      const vtIds = Array.from(new Set(rows.map((r) => r.visit_test_id)));

      try {
        const params = await prisma().testParameter.findMany({ where: { id: { in: paramIds } } });
        params.forEach((p) => paramsCache.set(p.id, p));

        const vts = await prisma().visitTest.findMany({
          where: { id: { in: vtIds } },
          include: { visit: { include: { patient: true } } },
        });
        vts.forEach((v) => vtCache.set(v.id, v));
      } catch (e) {
        // Non-fatal: without the caches we fall back to the cloud's own flag.
        logger.error("cloud", "[pull-results] batch cache prep failed", e);
      }
    },

    applyRow: async (r) => {
      // A locked visit test has been verified and signed off, and its report may
      // already be printed and handed to the patient. Nothing from the cloud may
      // rewrite it. The desktop write path enforces this (results.ipc:
      // `if (vt.isLocked) throw FORBIDDEN`); without the same guard here, sync is
      // a way around it. Record the attempt — a write arriving for a locked
      // result means either a bug or misuse, and both need to be visible.
      const visitTest = vtCache.get(r.visit_test_id);
      if (visitTest?.isLocked) {
        logger.warn(
          "cloud",
          `[pull-results] rejected cloud write to locked result ${r.id} (visitTest ${r.visit_test_id})`,
        );
        await audit.try("result.locked_write_rejected", {
          entityType: "TestResult",
          entityId: r.id,
          userId: r.entered_by_user_id ?? "",
          details: {
            visitTestId: r.visit_test_id,
            rejectedValue: r.value,
            cloudVersion: r.version ?? null,
          },
        });
        return;
      }

      const existing = await prisma().testResult.findUnique({ where: { id: r.id } });
      if (existing && existing.version > (r.version ?? 0)) {
        // Local copy newer — desktop wins.
        return;
      }

      // Recompute abnormality from the local parameter + patient when both are
      // known; otherwise trust the flag the cloud sent.
      let abnormal = r.is_abnormal;
      try {
        const param = paramsCache.get(r.parameter_id);
        if (param && visitTest?.visit?.patient) {
          abnormal = isAbnormal(
            {
              resultType: (param.resultType as ResultType) ?? "Numeric",
              value: r.value,
              patientSex: visitTest.visit.patient.sex as Sex,
              patientAge: visitTest.visit.patient.age,
              childAgeBoundary: 18,
              refRangeMaleMin: param.refRangeMaleMin ? Number(param.refRangeMaleMin) : null,
              refRangeMaleMax: param.refRangeMaleMax ? Number(param.refRangeMaleMax) : null,
              refRangeFemaleMin: param.refRangeFemaleMin ? Number(param.refRangeFemaleMin) : null,
              refRangeFemaleMax: param.refRangeFemaleMax ? Number(param.refRangeFemaleMax) : null,
              refRangeChildMin: param.refRangeChildMin ? Number(param.refRangeChildMin) : null,
              refRangeChildMax: param.refRangeChildMax ? Number(param.refRangeChildMax) : null,
              qualitativeOptions: param.qualitativeOptions,
              normalQualitative: param.normalQualitative,
            },
            r.abnormal_override,
          );
        }
      } catch {
        // ignore — fall back to cloud flag
      }

      const data = {
        id: r.id,
        visitTestId: r.visit_test_id,
        parameterId: r.parameter_id,
        value: r.value,
        isAbnormal: abnormal,
        abnormalOverride: r.abnormal_override ?? null,
        notes: r.notes ?? null,
        version: r.version ?? 1,
        enteredById: r.entered_by_user_id ?? "",
        enteredAt: new Date(r.entered_at),
      };

      await prisma().testResult.upsert({ where: { id: r.id }, create: data, update: data });
    },
  });
}
