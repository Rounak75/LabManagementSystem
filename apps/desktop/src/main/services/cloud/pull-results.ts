// Phase 3e Plan A — pull admin-portal-entered TestResult rows into local SQLite.
// Re-runs the local abnormality computation against locally-known parameter
// reference ranges so the report's "Abnormal" flag is authoritative on the
// desktop. Falls back to whatever the cloud row carried if the parameter
// isn't local yet (sync race).

import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";
import { isAbnormal } from "@main/services/abnormality";
import type { ResultType, Sex } from "@lab/types";

const SOURCE = "results";
const BATCH = 100;

interface RawResultRow {
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

export async function pullResults(): Promise<void> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.cloudSyncEnabled) return;
  if (!s.supabaseUrl || !s.supabaseAnonKey || !s.supabaseServiceKey) return;

  const client = createSupabaseClient({
    url: s.supabaseUrl,
    serviceKey: decryptSecret(s.supabaseServiceKey),
    anonKey: s.supabaseAnonKey,
  });

  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();

  let rows: RawResultRow[] = [];
  try {
    rows = (await client.fetchResultsSince(sinceIso, BATCH)) as unknown as RawResultRow[];
  } catch (e) {
    console.error("[pull-results] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  for (const r of rows) {
    try {
      const rowUpdated = new Date(r.updated_at);
      if (rowUpdated > latest) latest = rowUpdated;

      const existing = await prisma().testResult.findUnique({ where: { id: r.id } });
      if (existing && existing.version > (r.version ?? 0)) {
        // Local copy newer — desktop wins.
        continue;
      }

      // Recompute abnormality using locally-known parameter + patient if
      // available. If we can't resolve them, fall back to the cloud's flag.
      let abnormal = r.is_abnormal;
      try {
        const param = await prisma().testParameter.findUnique({
          where: { id: r.parameter_id },
        });
        const vt = await prisma().visitTest.findUnique({
          where: { id: r.visit_test_id },
          include: { visit: { include: { patient: true } } },
        });
        if (param && vt?.visit?.patient) {
          abnormal = isAbnormal({
            resultType: (param.resultType as ResultType) ?? "Numeric",
            value: r.value,
            patientSex: vt.visit.patient.sex as Sex,
            patientAge: vt.visit.patient.age,
            childAgeBoundary: 18,
            refRangeMaleMin: param.refRangeMaleMin ? Number(param.refRangeMaleMin) : null,
            refRangeMaleMax: param.refRangeMaleMax ? Number(param.refRangeMaleMax) : null,
            refRangeFemaleMin: param.refRangeFemaleMin ? Number(param.refRangeFemaleMin) : null,
            refRangeFemaleMax: param.refRangeFemaleMax ? Number(param.refRangeFemaleMax) : null,
            refRangeChildMin: param.refRangeChildMin ? Number(param.refRangeChildMin) : null,
            refRangeChildMax: param.refRangeChildMax ? Number(param.refRangeChildMax) : null,
            qualitativeOptions: param.qualitativeOptions,
            normalQualitative: param.normalQualitative,
          }, r.abnormal_override);
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

      await prisma().testResult.upsert({
        where: { id: r.id },
        create: data,
        update: data,
      });
    } catch (e) {
      console.error("[pull-results] row", r.id, "failed", e);
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest },
    create: { source: SOURCE, lastSyncedAt: latest },
  });
}
