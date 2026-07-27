import { logger } from "./logger";
// Phase 3e Plan A — pull admin-portal-created patients into local SQLite.
// Mirrors pull-bookings.ts. Skips rows where source != 'admin' to avoid
// echoing back our own outbox-pushed rows.

import { prisma } from "@main/db";

const SOURCE = "patients";
const BATCH = 100;

interface RawPatientRow {
  id: string;
  patient_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  age: number;
  sex: string;
  address: string | null;
  source: string;
  referred_by_id: string | null;
  created_by_id: string | null;
  portal_account_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export async function pullPatients(client: any): Promise<void> {
  
  const cursor = await prisma().syncCursor.findUnique({ where: { source: SOURCE } });
  const sinceIso = (cursor?.lastSyncedAt ?? new Date(0)).toISOString();
  const lastId = cursor?.lastId ?? undefined;

  let rows: RawPatientRow[] = [];
  try {
    rows = (await client.pullSince("patients", "updated_at", sinceIso, BATCH, undefined, lastId)) as unknown as RawPatientRow[];
  } catch (e) {
    logger.error("cloud", "[pull-patients] fetch failed", e);
    return;
  }
  if (rows.length === 0) return;

  let latest = cursor?.lastSyncedAt ?? new Date(0);
  let latestId = cursor?.lastId ?? null;

  for (const r of rows) {
    try {
      if (r.deleted_at) {
        latest = new Date(r.updated_at);
        latestId = r.id;
        continue;
      }
      if (r.source === "admin") {
        const data = {
          id: r.id,
          patientId: r.patient_id,
          name: r.name,
          phone: r.phone ?? null,
          email: r.email ?? null,
          age: r.age,
          sex: r.sex,
          address: r.address ?? null,
          referredById: r.referred_by_id ?? null,
          portalAccountId: r.portal_account_id ?? null,
          createdById: r.created_by_id ?? "",
          createdAt: new Date(r.created_at),
        };

        await prisma().patient.upsert({
          where: { id: r.id },
          create: data,
          update: data,
        });
      }

      // Success or skipped (not admin) -> advance cursor
      latest = new Date(r.updated_at);
      latestId = r.id;
    } catch (e: any) {
      if (e?.code === "P2002" || e?.code === "P2003") {
        logger.warn("cloud", "[pull-patients] skipping row" + " " + r.patient_id + " " + "— constraint conflict:" + " " + JSON.stringify(e.meta));
        // Skipped constraint conflict -> advance cursor
        latest = new Date(r.updated_at);
        latestId = r.id;
        continue;
      }
      logger.error("cloud", "[pull-patients] row" + " " + r.patient_id + " " + "failed", e);
      throw e;
    }
  }

  await prisma().syncCursor.upsert({
    where: { source: SOURCE },
    update: { lastSyncedAt: latest, lastId: latestId },
    create: { source: SOURCE, lastSyncedAt: latest, lastId: latestId },
  });
}
