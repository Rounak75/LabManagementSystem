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
  getLastTickHealth: vi.fn(),
  deadLetterCount: vi.fn(),
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
    syncDeadLetter: { count: mocks.deadLetterCount },
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
vi.mock("@main/services/cloud/sync-worker", () => ({
  runSyncTick: mocks.runSyncTick,
  getLastTickHealth: mocks.getLastTickHealth,
}));
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
    mocks.deadLetterCount.mockResolvedValue(0);
    mocks.getLastTickHealth.mockReturnValue(null);
  });

  it("cloud:getStatus requires session and returns status shape", async () => {
    mocks.fetchFreeTierStatus.mockResolvedValue({ db_size_bytes: 1024, recorded_at: "now" });
    const handler = mocks.registered.get("cloud:getStatus")!;
    const r = (await handler({})) as { enabled: boolean; freeTierBytes: number };
    expect(r.enabled).toBe(true);
    expect(r.freeTierBytes).toBe(1024);
  });

  // Health used to come only from the outbox, so a pull wedged on one bad row
  // reported "healthy" while results stopped arriving from the lab.
  it("cloud:getStatus reports pull-side health, not just the outbox", async () => {
    mocks.deadLetterCount.mockResolvedValue(3);
    mocks.getLastTickHealth.mockReturnValue({
      at: new Date("2026-07-27T10:00:00Z"),
      errors: ["results: constraint exploded"],
      unreachable: true,
    });

    const handler = mocks.registered.get("cloud:getStatus")!;
    const r = (await handler({})) as {
      stuckRowCount: number;
      lastTickErrors: string[];
      cloudUnreachable: boolean;
    };

    expect(r.stuckRowCount).toBe(3);
    expect(r.lastTickErrors).toEqual(["results: constraint exploded"]);
    expect(r.cloudUnreachable).toBe(true);
  });

  it("cloud:getStatus counts only unresolved stuck rows", async () => {
    const handler = mocks.registered.get("cloud:getStatus")!;
    await handler({});
    expect(mocks.deadLetterCount).toHaveBeenCalledWith({ where: { resolvedAt: null } });
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

  // runSyncTick already runs every registered pull handler in dependency order.
  // This handler used to follow it with its own hand-sorted list of the same
  // nine, so one manual check ran two full pull passes.
  it("cloud:checkNow runs one sync tick and reports its stats", async () => {
    mocks.runSyncTick.mockResolvedValue({
      pushed: 2, pulled: 9, failed: 0, errors: [], unreachable: false,
    });
    const handler = mocks.registered.get("cloud:checkNow")!;
    const r = (await handler({})) as {
      ok: boolean;
      stats: { pushed: number; pulled: number; errors: string[] };
    };

    expect(mocks.runSyncTick).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.stats).toEqual({ pushed: 2, pulled: 9, errors: [] });
  });

  it("cloud:checkNow does not run a second pull pass of its own", async () => {
    mocks.runSyncTick.mockResolvedValue({
      pushed: 0, pulled: 9, failed: 0, errors: [], unreachable: false,
    });
    const handler = mocks.registered.get("cloud:checkNow")!;
    await handler({});
    expect(mocks.pullPaymentEvents).not.toHaveBeenCalled();
  });

  it("cloud:checkNow surfaces tick errors instead of reporting ok", async () => {
    mocks.runSyncTick.mockResolvedValue({
      pushed: 0, pulled: 8, failed: 1, errors: ["results: constraint exploded"], unreachable: false,
    });
    const handler = mocks.registered.get("cloud:checkNow")!;
    const r = (await handler({})) as { ok: boolean; stats: { errors: string[] } };

    expect(r.ok).toBe(false);
    expect(r.stats.errors).toEqual(["results: constraint exploded"]);
  });

  it("cloud:checkNow reports when cloud sync is not configured", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false });
    const handler = mocks.registered.get("cloud:checkNow")!;
    const r = (await handler({})) as { ok: boolean; error: string };

    expect(r.ok).toBe(false);
    expect(r.error).toBe("Cloud sync not configured");
    expect(mocks.runSyncTick).not.toHaveBeenCalled();
  });
});
