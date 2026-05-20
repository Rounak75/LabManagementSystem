import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  visitFindUnique: vi.fn(),
  visitUpdate: vi.fn(),
  visitTestFindMany: vi.fn(),
  visitTestUpdateMany: vi.fn(),
  fetchVerificationsSince: vi.fn(),
  reportReady: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    visit: { findUnique: mocks.visitFindUnique, update: mocks.visitUpdate },
    visitTest: { findMany: mocks.visitTestFindMany, updateMany: mocks.visitTestUpdateMany },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: (s: string) => s }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({ fetchVerificationsSince: mocks.fetchVerificationsSince }),
}));
vi.mock("@main/services/notifications/triggers", () => ({ reportReady: mocks.reportReady }));

import { pullVerifications } from "../pull-verifications";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u",
    supabaseAnonKey: "a",
    supabaseServiceKey: "s",
  });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.visitFindUnique.mockResolvedValue({ id: "v1", status: "InProgress" });
  mocks.reportReady.mockResolvedValue([]);
});

const row = {
  id: "v1",
  visit_id: "VIS-2026-00001",
  source: "admin",
  verified_by_user_id: "u1",
  verified_at: "2026-05-20T12:00:00Z",
  updated_at: "2026-05-20T12:00:00Z",
};

describe("pullVerifications", () => {
  it("locks tests, completes the visit, and fires reportReady on a new verify", async () => {
    mocks.visitTestFindMany.mockResolvedValue([{ id: "vt1", isLocked: false, verifiedAt: null }]);
    mocks.fetchVerificationsSince.mockResolvedValue([row]);

    await pullVerifications();

    expect(mocks.visitTestUpdateMany).toHaveBeenCalledOnce();
    const arg = mocks.visitTestUpdateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ visitId: "v1" });
    expect(arg.data.isLocked).toBe(true);
    expect(arg.data.status).toBe("Ready");
    expect(arg.data.verifiedById).toBe("u1");
    expect((arg.data.verifiedAt as Date).toISOString()).toBe("2026-05-20T12:00:00.000Z");

    expect(mocks.visitUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { status: "Completed" } });
    expect(mocks.reportReady).toHaveBeenCalledOnce();
    expect(mocks.reportReady).toHaveBeenCalledWith("v1");
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("is idempotent: an already locked-and-verified visit does not re-notify", async () => {
    mocks.visitTestFindMany.mockResolvedValue([
      { id: "vt1", isLocked: true, verifiedAt: new Date("2026-05-20T12:00:00Z") },
    ]);
    mocks.fetchVerificationsSince.mockResolvedValue([row]);

    await pullVerifications();

    expect(mocks.visitTestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.visitUpdate).not.toHaveBeenCalled();
    expect(mocks.reportReady).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce(); // cursor still advances
  });

  it("skips rows whose visit is not present locally", async () => {
    mocks.visitFindUnique.mockResolvedValue(null);
    mocks.fetchVerificationsSince.mockResolvedValue([row]);

    await pullVerifications();

    expect(mocks.visitTestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.reportReady).not.toHaveBeenCalled();
  });
});
