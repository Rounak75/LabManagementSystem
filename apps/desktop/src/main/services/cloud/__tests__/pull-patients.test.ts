import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  patientUpsert: vi.fn(),
  decryptSecret: vi.fn((s: string) => s),
  fetchPatientsSince: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    patient: { upsert: mocks.patientUpsert },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({ fetchPatientsSince: mocks.fetchPatientsSince }),
}));

import { pullPatients } from "../pull-patients";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u",
    supabaseAnonKey: "a",
    supabaseServiceKey: "s",
  });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
});

describe("pullPatients", () => {
  it("inserts a new admin-source patient into local SQLite", async () => {
    mocks.fetchPatientsSince.mockResolvedValue([
      {
        id: "p1",
        patient_id: "LAB-2026-00100",
        name: "Test Patient",
        phone: "9999999999",
        age: 30,
        sex: "Male",
        source: "admin",
        created_by_id: "u1",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
    ]);
    await pullPatients();
    expect(mocks.patientUpsert).toHaveBeenCalledOnce();
    const arg = mocks.patientUpsert.mock.calls[0]![0];
    expect(arg.where.id).toBe("p1");
    expect(arg.create.name).toBe("Test Patient");
    expect(arg.create.patientId).toBe("LAB-2026-00100");
  });

  it("skips desktop-source rows (they came from our own outbox)", async () => {
    mocks.fetchPatientsSince.mockResolvedValue([
      {
        id: "p2",
        patient_id: "LAB-2026-00101",
        name: "Desktop Patient",
        phone: "8888888888",
        age: 40,
        sex: "Female",
        source: "desktop",
        created_by_id: "u1",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
    ]);
    await pullPatients();
    expect(mocks.patientUpsert).not.toHaveBeenCalled();
  });

  it("advances the sync cursor to the latest updated_at across rows", async () => {
    mocks.fetchPatientsSince.mockResolvedValue([
      {
        id: "p3",
        patient_id: "LAB-2026-00102",
        name: "X",
        phone: "7777777777",
        age: 25,
        sex: "Male",
        source: "admin",
        created_by_id: "u1",
        created_at: "2026-05-20T11:00:00Z",
        updated_at: "2026-05-20T11:30:00Z",
      },
      {
        id: "p4",
        patient_id: "LAB-2026-00103",
        name: "Y",
        phone: "6666666666",
        age: 50,
        sex: "Female",
        source: "desktop", // skipped but still advances cursor
        created_by_id: "u1",
        created_at: "2026-05-20T11:00:00Z",
        updated_at: "2026-05-20T11:45:00Z",
      },
    ]);
    await pullPatients();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
    const arg = mocks.syncCursorUpsert.mock.calls[0]![0];
    expect(arg.where.source).toBe("patients");
    expect((arg.update.lastSyncedAt as Date).toISOString()).toBe("2026-05-20T11:45:00.000Z");
  });

  it("noop when cloudSyncEnabled is false", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false });
    await pullPatients();
    expect(mocks.fetchPatientsSince).not.toHaveBeenCalled();
    expect(mocks.patientUpsert).not.toHaveBeenCalled();
  });
});
