// Phase 3e Plan A — pull Queued PrintJob rows from cloud and immediately
// move them to Picked locally. Because PrintJob is in SYNCED_MODELS, the local
// upsert fires the outbox push that flips the cloud row to Picked too — no
// manual cloud write needed. The desktop's print pipeline (separate module,
// added later) reads Picked jobs from local SQLite and prints them.

import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";

const SOURCE = "print_jobs";
const BATCH = 100;

interface RawPrintJobRow {
  id: string;
  visit_id: string;
  requested_by_id: string;
  requested_at: string;
  status: string;
  picked_up_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export async function pullPrintJobs(): Promise<void> {
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

  let rows: RawPrintJobRow[] = [];
  try {
    rows = (await client.fetchPrintJobsSince(sinceIso, BATCH)) as unknown as RawPrintJobRow[];
  } catch (e) {
    console.error("[pull-print-jobs] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  const now = new Date();
  for (const r of rows) {
    try {
      const requestedAt = new Date(r.requested_at);
      if (requestedAt > latest) latest = requestedAt;

      const existing = await prisma().printJob.findUnique({ where: { id: r.id } });
      if (existing && existing.status !== "Queued") {
        // Already in a non-Queued state locally; don't reset.
        continue;
      }

      await prisma().printJob.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          visitId: r.visit_id,
          requestedById: r.requested_by_id,
          requestedAt,
          status: "Picked",
          pickedUpAt: now,
        },
        update: {
          status: "Picked",
          pickedUpAt: now,
        },
      });
    } catch (e) {
      console.error("[pull-print-jobs] row", r.id, "failed", e);
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest },
    create: { source: SOURCE, lastSyncedAt: latest },
  });
}
