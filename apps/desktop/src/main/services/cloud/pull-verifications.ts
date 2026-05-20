// Phase 3e Plan A — pull verification events: visits whose verified_at + verified_by_user_id
// advanced in the cloud (e.g. father tapped Verify in the admin portal).
//
// Phase 3e Plan E — these must reach the same end-state as the desktop's own
// verify-lock handler (visits.ipc `visitTests:lock`): lock every VisitTest, mark
// it Ready, flip the Visit to Completed, and fire the ReportReady patient
// notification exactly once. Idempotent — a visit already fully locked is skipped,
// so re-running never re-notifies.

import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import * as triggers from "@main/services/notifications/triggers";
import { createSupabaseClient } from "./supabase-client";

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

export async function pullVerifications(): Promise<void> {
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

  let rows: RawVerificationRow[] = [];
  try {
    rows = (await client.fetchVerificationsSince(sinceIso, BATCH)) as unknown as RawVerificationRow[];
  } catch (e) {
    console.error("[pull-verifications] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  for (const r of rows) {
    try {
      if (!r.verified_at) continue;
      const verifiedAt = new Date(r.verified_at);
      if (verifiedAt > latest) latest = verifiedAt;

      const local = await prisma().visit.findUnique({ where: { id: r.id } });
      if (!local) continue;

      const tests = await prisma().visitTest.findMany({ where: { visitId: r.id } });
      if (tests.length === 0) continue;

      // Idempotent guard: already fully locked-and-verified → nothing to do.
      if (tests.every((t) => t.isLocked && t.verifiedAt)) continue;

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
      try {
        await triggers.reportReady(r.id);
      } catch (e) {
        console.error("[pull-verifications] reportReady trigger failed", e);
      }
    } catch (e) {
      console.error("[pull-verifications] row", r.id, "failed", e);
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest },
    create: { source: SOURCE, lastSyncedAt: latest },
  });
}
