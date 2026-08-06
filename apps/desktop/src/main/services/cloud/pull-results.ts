// Phase 3e Plan A — pull admin-portal-entered TestResult rows into local SQLite.
// Re-runs the local abnormality computation against locally-known parameter
// reference ranges so the report's "Abnormal" flag is authoritative on the
// desktop. Falls back to whatever the cloud row carried if the parameter isn't
// local yet (sync race).

import { prisma } from "@main/db";
import { isAbnormal } from "@main/services/abnormality";
import { audit } from "@main/services/audit-best-effort";
import { logger } from "./logger";
import { runPull, type PullStats } from "./pull-runner";
import type { CloudClient } from "./sync-engine";
import type { ResultType, Sex } from "@lab/types";

const SOURCE = "results";

/**
 * Works out which of a result's three parents this machine is actually missing.
 *
 * Runs only after a constraint has already fired, so three extra reads cost
 * nothing on the happy path — and they are read from the database rather than
 * the page caches, because a replay of a quarantined row arrives with no page
 * and so no caches at all.
 */
async function describeMissingParents(
  r: RawResultRow,
  enteredById: string,
  cause: Error,
): Promise<string> {
  const missing: string[] = [];
  try {
    const [vt, param, user] = await Promise.all([
      prisma().visitTest.findUnique({ where: { id: r.visit_test_id }, select: { id: true } }),
      prisma().testParameter.findUnique({ where: { id: r.parameter_id }, select: { id: true } }),
      prisma().user.findUnique({ where: { id: enteredById }, select: { id: true } }),
    ]);
    if (!vt) missing.push(`visit_test ${r.visit_test_id}`);
    if (!param) missing.push(`parameter ${r.parameter_id}`);
    if (!user) missing.push(`user ${enteredById}`);
  } catch {
    // Diagnosis is a bonus; the constraint failure is the fact being reported.
  }

  if (missing.length === 0) {
    // The constraint fired but every parent is present now — a race with the
    // stream that owns them, not an orphan. It should apply on the next replay.
    return `result ${r.id} hit a foreign key constraint but its parents are all present — likely a sync race: ${cause.message}`;
  }
  return `result ${r.id} cannot be applied: this machine has no ${missing.join(", no ")}. ${cause.message}`;
}

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

export async function pullResults(client: CloudClient): Promise<PullStats> {
  // Parameters and visit tests for the whole page, so abnormality can be
  // recomputed without a query per row.
  let paramsCache = new Map<string, ParameterRow>();
  let vtCache = new Map<string, VisitTestRow>();
  // Which of the page's authors this machine actually has. Loaded per page for
  // the same reason as the others: one query instead of one per row.
  let knownUserIds = new Set<string>();
  // The age below which a paediatric reference range applies. This was hardcoded
  // to 18 while the desktop's own result-entry path (results.ipc) read
  // labSettings.childAgeBoundary, default 12 — so the same value, for the same
  // patient, was flagged against the child range if it arrived from the staff
  // portal and the adult range if a staff member typed it here. Whichever the
  // lab has configured is the one that decides.
  let childAgeBoundary = 12;

  return runPull<RawResultRow>(client, {
    source: SOURCE,
    table: "results",
    cursorColumn: "updated_at",

    prepare: async (rows) => {
      paramsCache = new Map();
      vtCache = new Map();
      knownUserIds = new Set();
      const paramIds = Array.from(new Set(rows.map((r) => r.parameter_id)));
      const vtIds = Array.from(new Set(rows.map((r) => r.visit_test_id)));
      const userIds = Array.from(
        new Set(rows.map((r) => r.entered_by_user_id).filter((id): id is string => !!id)),
      );

      // Guarded separately from the caches below. Folded into the same try, a
      // settings read that failed would leave every cache empty, and a result
      // whose author or visit test could not then be resolved is thrown out
      // rather than merely flagged with a stale boundary.
      try {
        const settings = await prisma().labSettings.findUnique({
          where: { id: "singleton" },
          select: { childAgeBoundary: true },
        });
        childAgeBoundary = settings?.childAgeBoundary ?? 12;
      } catch (e) {
        childAgeBoundary = 12;
        logger.error("cloud", "[pull-results] could not read childAgeBoundary — using 12", e);
      }

      try {
        const params = await prisma().testParameter.findMany({ where: { id: { in: paramIds } } });
        params.forEach((p) => paramsCache.set(p.id, p));

        const vts = await prisma().visitTest.findMany({
          where: { id: { in: vtIds } },
          include: { visit: { include: { patient: true } } },
        });
        vts.forEach((v) => vtCache.set(v.id, v));

        if (userIds.length > 0) {
          const users = await prisma().user.findMany({
            where: { id: { in: userIds } },
            select: { id: true },
          });
          users.forEach((u) => knownUserIds.add(u.id));
        }
      } catch (e) {
        // Non-fatal: without the caches we fall back to the cloud's own flag, and
        // to the visit's staff member as the result's author.
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

      // Who entered it has to be a user this machine knows: enteredById is a
      // foreign key. The cloud value was passed straight through with `?? ""`,
      // and an empty string matches no User row, so the insert failed the
      // constraint and a result a staff member had actually typed was retried
      // until it was quarantined. Fall back to the staff member on the visit —
      // a real user by construction — rather than lose the result over the
      // question of who keyed it in.
      const claimed = r.entered_by_user_id ?? "";
      let enteredById = claimed;
      if (!claimed || !knownUserIds.has(claimed)) {
        const fallback = visitTest?.visit?.staffId;
        if (!fallback) {
          throw new Error(
            `no local user for result ${r.id} (entered_by_user_id ${JSON.stringify(r.entered_by_user_id)})`,
          );
        }
        logger.warn(
          "cloud",
          `[pull-results] unknown user ${JSON.stringify(claimed)} on result ${r.id} — attributing to visit staff ${fallback}`,
        );
        enteredById = fallback;
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
              childAgeBoundary,
              refRangeMaleMin: param.refRangeMaleMin,
              refRangeMaleMax: param.refRangeMaleMax,
              refRangeFemaleMin: param.refRangeFemaleMin,
              refRangeFemaleMax: param.refRangeFemaleMax,
              refRangeChildMin: param.refRangeChildMin,
              refRangeChildMax: param.refRangeChildMax,
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
        enteredById,
        enteredAt: new Date(r.entered_at),
      };

      try {
        await prisma().testResult.upsert({ where: { id: r.id }, create: data, update: data });
      } catch (e) {
        // Every id on this row is a foreign key, and Prisma reports a violation
        // on any of them with the same message, naming none. Listing all three
        // left the reader to work out which was actually absent, against the
        // production database — so look, and name only what is missing.
        if ((e as { code?: string })?.code === "P2003") {
          throw new Error(await describeMissingParents(r, enteredById, e as Error));
        }
        throw e;
      }
    },
  });
}
