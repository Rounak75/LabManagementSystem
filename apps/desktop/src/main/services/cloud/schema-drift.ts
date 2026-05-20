import { prisma } from "@main/db";
import { decryptSecret } from "@main/services/crypto.service";
import { createSupabaseClient } from "./supabase-client";

export const EXPECTED_COLUMNS: Array<{ table: string; columns: string[] }> = [
  { table: "patients", columns: ["id", "name", "phone"] },
  { table: "visits", columns: ["id", "patient_id", "visit_id", "created_at"] },
  { table: "visit_tests", columns: ["id", "visit_id", "test_id"] },
  { table: "results", columns: ["id", "visit_test_id", "parameter_id", "value"] },
  { table: "invoices", columns: ["id", "visit_id", "total", "payment_status"] },
  { table: "payments", columns: ["id", "invoice_id", "amount"] },
  { table: "doctors", columns: ["id", "name"] },
  { table: "tests", columns: ["id", "name"] },
  { table: "parameters", columns: ["id", "test_id", "name"] },
  { table: "lab_settings", columns: ["id", "lab_name"] },
  { table: "home_visits", columns: ["id", "booker_name"] },
  { table: "lab_closures", columns: ["id", "date"] },
  // Phase 3e Plan A
  { table: "users", columns: ["id"] },
  { table: "id_reservations", columns: ["id", "prefix", "number"] },
  { table: "print_jobs", columns: ["id", "visit_id", "status"] },
  { table: "client_errors", columns: ["id", "message", "logged_at"] },
];

export interface DriftResult {
  ok: boolean;
  missing: Array<{ table: string; column: string }>;
}

export async function checkSchemaDrift(): Promise<DriftResult> {
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s?.cloudSyncEnabled) return { ok: true, missing: [] };
  if (!s.supabaseUrl || !s.supabaseAnonKey || !s.supabaseServiceKey) {
    return { ok: true, missing: [] };
  }

  const client = createSupabaseClient({
    url: s.supabaseUrl,
    serviceKey: decryptSecret(s.supabaseServiceKey),
    anonKey: s.supabaseAnonKey,
  });

  const tableNames = EXPECTED_COLUMNS.map((t) => t.table);
  const actual = (await client.fetchColumnInfo(tableNames)) as Array<{ table_name: string; column_name: string }>;
  const have = new Set(actual.map((c) => `${c.table_name}.${c.column_name}`));

  const missing: Array<{ table: string; column: string }> = [];
  for (const t of EXPECTED_COLUMNS) {
    for (const col of t.columns) {
      if (!have.has(`${t.table}.${col}`)) {
        missing.push({ table: t.table, column: col });
      }
    }
  }

  if (missing.length > 0) {
    await prisma().labSettings.update({
      where: { id: "singleton" },
      data: { cloudSyncEnabled: false },
    });
  }

  return { ok: missing.length === 0, missing };
}
