import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  visitUpsert: vi.fn(),
  visitTestUpsert: vi.fn(),
  fetchVisitsSince: vi.fn(),
  fetchVisitTestsForVisit: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    visit: { upsert: mocks.visitUpsert },
    visitTest: { upsert: mocks.visitTestUpsert },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: (s: string) => s }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({
    fetchVisitsSince: mocks.fetchVisitsSince,
    fetchVisitTestsForVisit: mocks.fetchVisitTestsForVisit,
  }),
}));

import { pullVisits } from "../pull-visits";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u",
    supabaseAnonKey: "a",
    supabaseServiceKey: "s",
  });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.fetchVisitTestsForVisit.mockResolvedValue([]);
});

describe("pullVisits", () => {
  it("inserts admin-source visit + its VisitTests (from the visit_tests table)", async () => {
    mocks.fetchVisitsSince.mockResolvedValue([
      {
        id: "v1",
        visit_id: "VIS-2026-00010",
        patient_id: "p1",
        type: "WalkIn",
        visit_date: "2026-05-20T08:00:00Z",
        status: "Open",
        staff_id: "u1",
        source: "admin",
        created_at: "2026-05-20T08:00:00Z",
        updated_at: "2026-05-20T08:00:00Z",
      },
    ]);
    mocks.fetchVisitTestsForVisit.mockResolvedValue([
      { id: "vt1", visit_id: "v1", test_id: "t1", status: "Collected" },
      { id: "vt2", visit_id: "v1", test_id: "t2", status: "Pending" },
    ]);
    await pullVisits();
    expect(mocks.visitUpsert).toHaveBeenCalledOnce();
    expect(mocks.visitUpsert.mock.calls[0]![0].create.visitId).toBe("VIS-2026-00010");
    expect(mocks.fetchVisitTestsForVisit).toHaveBeenCalledWith("v1");
    expect(mocks.visitTestUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.visitTestUpsert.mock.calls[0]![0].where.id).toBe("vt1");
    expect(mocks.visitTestUpsert.mock.calls[0]![0].create.testId).toBe("t1");
    expect(mocks.visitTestUpsert.mock.calls[1]![0].create.status).toBe("Pending");
  });

  it("skips desktop-source visits but still advances cursor", async () => {
    mocks.fetchVisitsSince.mockResolvedValue([
      {
        id: "v2",
        visit_id: "VIS-2026-00011",
        patient_id: "p1",
        type: "WalkIn",
        visit_date: "2026-05-20T09:00:00Z",
        status: "Open",
        staff_id: "u1",
        source: "desktop",
        created_at: "2026-05-20T09:00:00Z",
        updated_at: "2026-05-20T09:00:00Z",
      },
    ]);
    await pullVisits();
    expect(mocks.visitUpsert).not.toHaveBeenCalled();
    expect(mocks.fetchVisitTestsForVisit).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("upserts no children when the visit has no visit_tests", async () => {
    mocks.fetchVisitsSince.mockResolvedValue([
      {
        id: "v3",
        visit_id: "VIS-2026-00012",
        patient_id: "p1",
        type: "WalkIn",
        visit_date: "2026-05-20T10:00:00Z",
        status: "Open",
        staff_id: "u1",
        source: "admin",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
    ]);
    mocks.fetchVisitTestsForVisit.mockResolvedValue([]);
    await pullVisits();
    expect(mocks.visitUpsert).toHaveBeenCalledOnce();
    expect(mocks.visitTestUpsert).not.toHaveBeenCalled();
  });
});
