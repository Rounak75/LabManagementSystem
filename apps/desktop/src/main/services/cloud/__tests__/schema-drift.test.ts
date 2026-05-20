import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchColumnInfo: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  labSettingsUpdate: vi.fn(),
  decryptSecret: vi.fn((s: string) => s.replace("enc:", "")),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique, update: mocks.labSettingsUpdate },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({ fetchColumnInfo: mocks.fetchColumnInfo }),
}));

import { checkSchemaDrift, EXPECTED_COLUMNS } from "../schema-drift";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u", supabaseAnonKey: "a", supabaseServiceKey: "enc:s",
  });
});

describe("checkSchemaDrift", () => {
  it("returns ok=true when all expected columns are present", async () => {
    const cols = EXPECTED_COLUMNS.flatMap((t) =>
      t.columns.map((c) => ({ table_name: t.table, column_name: c, data_type: "text" }))
    );
    mocks.fetchColumnInfo.mockResolvedValue(cols);
    const r = await checkSchemaDrift();
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("returns ok=false and disables sync when columns are missing", async () => {
    const cols = EXPECTED_COLUMNS.flatMap((t) =>
      t.columns.slice(0, 1).map((c) => ({ table_name: t.table, column_name: c, data_type: "text" }))
    );
    mocks.fetchColumnInfo.mockResolvedValue(cols);
    const r = await checkSchemaDrift();
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(mocks.labSettingsUpdate).toHaveBeenCalledWith({
      where: { id: "singleton" },
      data: { cloudSyncEnabled: false },
    });
  });

  it("no-op when sync disabled", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false });
    const r = await checkSchemaDrift();
    expect(r.ok).toBe(true);
    expect(mocks.fetchColumnInfo).not.toHaveBeenCalled();
  });
});
