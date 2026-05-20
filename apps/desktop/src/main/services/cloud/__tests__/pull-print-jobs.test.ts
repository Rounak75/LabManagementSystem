import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  printJobFindUnique: vi.fn(),
  printJobUpsert: vi.fn(),
  fetchPrintJobsSince: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    printJob: { findUnique: mocks.printJobFindUnique, upsert: mocks.printJobUpsert },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: (s: string) => s }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({ fetchPrintJobsSince: mocks.fetchPrintJobsSince }),
}));

import { pullPrintJobs } from "../pull-print-jobs";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "u",
    supabaseAnonKey: "a",
    supabaseServiceKey: "s",
  });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.printJobFindUnique.mockResolvedValue(null);
});

describe("pullPrintJobs", () => {
  it("inserts a new Queued PrintJob and marks it Picked locally", async () => {
    mocks.fetchPrintJobsSince.mockResolvedValue([
      {
        id: "pj1",
        visit_id: "v1",
        requested_by_id: "u1",
        requested_at: "2026-05-20T16:00:00Z",
        status: "Queued",
      },
    ]);
    await pullPrintJobs();
    expect(mocks.printJobUpsert).toHaveBeenCalledOnce();
    const arg = mocks.printJobUpsert.mock.calls[0]![0];
    expect(arg.create.status).toBe("Picked");
    expect(arg.create.visitId).toBe("v1");
    expect(arg.update.status).toBe("Picked");
  });

  it("does not re-pick a job already in non-Queued status locally", async () => {
    mocks.printJobFindUnique.mockResolvedValue({ id: "pj2", status: "Done" });
    mocks.fetchPrintJobsSince.mockResolvedValue([
      {
        id: "pj2",
        visit_id: "v2",
        requested_by_id: "u1",
        requested_at: "2026-05-20T16:00:00Z",
        status: "Queued",
      },
    ]);
    await pullPrintJobs();
    expect(mocks.printJobUpsert).not.toHaveBeenCalled();
  });

  it("advances the sync cursor", async () => {
    mocks.fetchPrintJobsSince.mockResolvedValue([
      {
        id: "pj3",
        visit_id: "v3",
        requested_by_id: "u1",
        requested_at: "2026-05-20T17:30:00Z",
        status: "Queued",
      },
    ]);
    await pullPrintJobs();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
    const arg = mocks.syncCursorUpsert.mock.calls[0]![0];
    expect(arg.where.source).toBe("print_jobs");
    expect((arg.update.lastSyncedAt as Date).toISOString()).toBe("2026-05-20T17:30:00.000Z");
  });
});
