// Phase 3e Plan A — pull admin-portal-created patients into local SQLite.
// Skips rows where source != 'admin' to avoid echoing back our own
// outbox-pushed rows. Cursor handling, retry and quarantine live in runPull.

import { prisma } from "@main/db";
import { runPull } from "./pull-runner";
import type { CloudClient } from "./sync-engine";

const SOURCE = "patients";

interface RawPatientRow extends Record<string, unknown> {
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

export async function pullPatients(client: CloudClient): Promise<void> {
  await runPull<RawPatientRow>(client, {
    source: SOURCE,
    table: "patients",
    cursorColumn: "updated_at",
    shouldApply: (r) => r.source === "admin" && !r.deleted_at,
    applyRow: async (r) => {
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

      await prisma().patient.upsert({ where: { id: r.id }, create: data, update: data });
    },
  });
}
