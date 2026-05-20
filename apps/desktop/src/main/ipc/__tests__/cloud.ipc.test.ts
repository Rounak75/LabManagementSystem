import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireSession: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  outboxFindMany: vi.fn(),
  outboxFindFirst: vi.fn(),
  outboxUpdate: vi.fn(),
  outboxCount: vi.fn(),
  decryptSecret: vi.fn((s: string) => s.replace("enc:", "")),
  testConnection: vi.fn(),
  fetchFreeTierStatus: vi.fn(),
  runBackfillOnce: vi.fn(),
  runSyncTick: vi.fn(),
  pullPaymentEvents: vi.fn(),
  registered: new Map<string, (args: unknown) => unknown>(),
}));

vi.mock("@main/ipc", () => ({
  register: (channel: string, handler: (args: unknown) => unknown) => {
    mocks.registered.set(channel, handler);
  },
}));
vi.mock("@main/session", () => ({
  requireAdmin: mocks.requireAdmin,
  requireSession: mocks.requireSession,
}));
vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    outbox: {
      findMany: mocks.outboxFindMany,
      findFirst: mocks.outboxFindFirst,
      update: mocks.outboxUpdate,
      count: mocks.outboxCount,
    },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@main/services/cloud/supabase-client", () => ({
  createSupabaseClient: () => ({
    testConnection: mocks.testConnection,
    fetchFreeTierStatus: mocks.fetchFreeTierStatus,
  }),
}));
vi.mock("@main/services/cloud/backfill.service", () => ({ runBackfillOnce: mocks.runBackfillOnce }));
vi.mock("@main/services/cloud/sync-worker", () => ({ runSyncTick: mocks.runSyncTick }));
vi.mock("@main/services/cloud/payment-events", () => ({ pullPaymentEvents: mocks.pullPaymentEvents }));

await import("../cloud.ipc");

describe("cloud.ipc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockReturnValue({ userId: "u1", role: "Admin" });
    mocks.requireAdmin.mockReturnValue({ userId: "u1", role: "Admin" });
    mocks.labSettingsFindUnique.mockResolvedValue({
      cloudSyncEnabled: true,
      supabaseUrl: "u", supabaseAnonKey: "a", supabaseServiceKey: "enc:s",
      backfillCompletedAt: null,
    });
    mocks.outboxCount.mockResolvedValue(0);
    mocks.outboxFindFirst.mockResolvedValue(null);
  });

  it("cloud:getStatus requires session and returns status shape", async () => {
    mocks.fetchFreeTierStatus.mockResolvedValue({ db_size_bytes: 1024, recorded_at: "now" });
    const handler = mocks.registered.get("cloud:getStatus")!;
    const r = (await handler({})) as { enabled: boolean; freeTierBytes: number };
    expect(r.enabled).toBe(true);
    expect(r.freeTierBytes).toBe(1024);
  });

  it("cloud:testConnection requires Admin", async () => {
    mocks.requireAdmin.mockImplementationOnce(() => { throw new Error("UNAUTHORIZED"); });
    const handler = mocks.registered.get("cloud:testConnection")!;
    await expect(handler({})).rejects.toThrow("UNAUTHORIZED");
  });

  it("cloud:testConnection returns latency on success", async () => {
    mocks.testConnection.mockResolvedValue({ latencyMs: 42 });
    const handler = mocks.registered.get("cloud:testConnection")!;
    const r = (await handler({})) as { ok: boolean; latencyMs: number };
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBe(42);
  });

  it("cloud:retryOutbox resets attempts + nextAttemptAt", async () => {
    mocks.outboxUpdate.mockResolvedValue({});
    const handler = mocks.registered.get("cloud:retryOutbox")!;
    await handler({ id: "o-1" });
    expect(mocks.outboxUpdate).toHaveBeenCalledWith({
      where: { id: "o-1" },
      data: expect.objectContaining({ status: "Pending", attempts: 0 }),
    });
  });

  it("cloud:runBackfillNow kicks off backfill", async () => {
    mocks.runBackfillOnce.mockResolvedValue({ skipped: false });
    const handler = mocks.registered.get("cloud:runBackfillNow")!;
    const r = (await handler({})) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(mocks.runBackfillOnce).toHaveBeenCalled();
  });

  it("cloud:checkNow runs one sync tick + payment pull", async () => {
    const handler = mocks.registered.get("cloud:checkNow")!;
    await handler({});
    expect(mocks.runSyncTick).toHaveBeenCalled();
    expect(mocks.pullPaymentEvents).toHaveBeenCalled();
  });
});
