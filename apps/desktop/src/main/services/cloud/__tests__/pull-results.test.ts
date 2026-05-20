import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  testResultFindUnique: vi.fn(),
  testResultUpsert: vi.fn(),
  testParameterFindUnique: vi.fn(),
  visitTestFindUnique: vi.fn(),
  fetchResultsSince: vi.fn(),
  isAbnormal: vi.fn(() => false),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    testResult: { findUnique: mocks.testResultFindUnique, upsert: mocks.testResultUpsert },
    testParameter: { findUnique: mocks.testParameterFindUnique },
    visitTest: { findUnique: mocks.visitTestFindUnique },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: (s: string) => s }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({ fetchResultsSince: mocks.fetchResultsSince }),
}));
vi.mock("@main/services/abnormality", () => ({ isAbnormal: mocks.isAbnormal }));

import { pullResults } from "../pull-results";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u",
    supabaseAnonKey: "a",
    supabaseServiceKey: "s",
  });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.testResultFindUnique.mockResolvedValue(null);
  mocks.testParameterFindUnique.mockResolvedValue(null);
  mocks.visitTestFindUnique.mockResolvedValue(null);
  mocks.isAbnormal.mockReturnValue(false);
});

describe("pullResults", () => {
  it("inserts a new admin-source result", async () => {
    mocks.fetchResultsSince.mockResolvedValue([
      {
        id: "r1",
        visit_test_id: "vt1",
        parameter_id: "param1",
        value: "5.4",
        is_abnormal: false,
        abnormal_override: null,
        notes: null,
        version: 1,
        entered_by_user_id: "u1",
        entered_at: "2026-05-20T12:00:00Z",
        updated_at: "2026-05-20T12:00:00Z",
      },
    ]);
    await pullResults();
    expect(mocks.testResultUpsert).toHaveBeenCalledOnce();
    const arg = mocks.testResultUpsert.mock.calls[0]![0];
    expect(arg.create.value).toBe("5.4");
    expect(arg.create.parameterId).toBe("param1");
  });

  it("respects local version > cloud version (does not overwrite)", async () => {
    mocks.testResultFindUnique.mockResolvedValue({ id: "r2", version: 5 });
    mocks.fetchResultsSince.mockResolvedValue([
      {
        id: "r2",
        visit_test_id: "vt1",
        parameter_id: "param1",
        value: "999",
        is_abnormal: true,
        abnormal_override: null,
        notes: null,
        version: 3, // older than local
        entered_by_user_id: "u1",
        entered_at: "2026-05-20T12:00:00Z",
        updated_at: "2026-05-20T12:00:00Z",
      },
    ]);
    await pullResults();
    expect(mocks.testResultUpsert).not.toHaveBeenCalled();
    // cursor still advances
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("recomputes abnormality flag from local parameter + patient", async () => {
    mocks.testParameterFindUnique.mockResolvedValue({
      id: "param1",
      resultType: "Numeric",
      refRangeMaleMin: 4,
      refRangeMaleMax: 7,
      refRangeFemaleMin: 4,
      refRangeFemaleMax: 7,
      refRangeChildMin: null,
      refRangeChildMax: null,
      qualitativeOptions: null,
      normalQualitative: null,
    });
    mocks.visitTestFindUnique.mockResolvedValue({
      id: "vt1",
      visit: { patient: { sex: "Male", age: 35 } },
    });
    mocks.isAbnormal.mockReturnValue(true);
    mocks.fetchResultsSince.mockResolvedValue([
      {
        id: "r3",
        visit_test_id: "vt1",
        parameter_id: "param1",
        value: "12.0",
        is_abnormal: false, // cloud said normal; local lookup overrides
        abnormal_override: null,
        notes: null,
        version: 1,
        entered_by_user_id: "u1",
        entered_at: "2026-05-20T12:00:00Z",
        updated_at: "2026-05-20T12:00:00Z",
      },
    ]);
    await pullResults();
    expect(mocks.isAbnormal).toHaveBeenCalledOnce();
    expect(mocks.testResultUpsert.mock.calls[0]![0].create.isAbnormal).toBe(true);
  });
});
