import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient, type FakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  dequeueBatch: vi.fn(),
  markSent: vi.fn(),
  scheduleRetry: vi.fn(),
  pruneSent: vi.fn(),
  decryptSecret: vi.fn((s: string) => s.replace("enc:", "")),
  createSupabaseClient: vi.fn(),
  tickLogCreate: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncTickLog: { create: mocks.tickLogCreate },
  }),
}));
vi.mock("../outbox.service", () => ({
  dequeueBatch: mocks.dequeueBatch,
  markSent: mocks.markSent,
  scheduleRetry: mocks.scheduleRetry,
  pruneSent: mocks.pruneSent,
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../supabase-client", () => ({ createSupabaseClient: mocks.createSupabaseClient }));

import {
  runSyncTick,
  nextDelayMs,
  BASE_TICK_MS,
  MAX_IDLE_TICK_MS,
  MAX_OFFLINE_TICK_MS,
} from "../sync-worker";

let cloud: FakeCloudClient;

function outboxRow(over: Record<string, unknown> = {}) {
  return {
    id: "o-1",
    tableName: "patients",
    operation: "create",
    rowId: "p-1",
    payload: '{"id":"p-1"}',
    attempts: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cloud = makeFakeCloudClient();
  mocks.createSupabaseClient.mockImplementation(() => cloud);
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "https://x.supabase.co",
    supabaseAnonKey: "a",
    supabaseServiceKey: "enc:s",
  });
  mocks.dequeueBatch.mockResolvedValue([]);
  mocks.pruneSent.mockResolvedValue(0);
});

describe("runSyncTick", () => {
  it("no-op when sync disabled", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false });
    await runSyncTick();
    expect(mocks.dequeueBatch).not.toHaveBeenCalled();
  });

  it("pushes a batch per (table, operation) group and marks each row sent", async () => {
    mocks.dequeueBatch.mockResolvedValue([
      outboxRow({ id: "o-1", rowId: "p-1" }),
      outboxRow({ id: "o-2", tableName: "visits", operation: "update", rowId: "v-1" }),
    ]);

    await runSyncTick();

    // One batch call per group — not one call per row.
    expect(cloud.pushBatch).toHaveBeenCalledTimes(2);
    expect(cloud.pushRow).not.toHaveBeenCalled();
    expect(mocks.markSent).toHaveBeenCalledWith("o-1");
    expect(mocks.markSent).toHaveBeenCalledWith("o-2");
  });

  it("falls back to row-by-row when a batch fails, to isolate the bad row", async () => {
    cloud = makeFakeCloudClient({
      pushBatch: vi.fn().mockRejectedValue(new Error("batch rejected")),
      pushRow: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined),
    });
    mocks.dequeueBatch.mockResolvedValue([
      outboxRow({ id: "o-1", rowId: "p-1" }),
      outboxRow({ id: "o-2", rowId: "p-2" }),
    ]);

    await runSyncTick();

    expect(mocks.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "o-1" }),
      expect.any(Error),
    );
    expect(mocks.markSent).toHaveBeenCalledWith("o-2");
  });

  it("compaction: later updates to same (tableName, rowId) supersede earlier ones", async () => {
    mocks.dequeueBatch.mockResolvedValue([
      outboxRow({ id: "o-1", operation: "update", payload: '{"id":"p-1","v":1}' }),
      outboxRow({ id: "o-2", operation: "update", payload: '{"id":"p-1","v":2}' }),
    ]);

    await runSyncTick();

    expect(cloud.pushBatch).toHaveBeenCalledTimes(1);
    const rows = cloud.pushBatch.mock.calls[0]![2];
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ id: "p-1", v: 2 });
    // Both outbox entries are retired, not just the surviving one.
    expect(mocks.markSent).toHaveBeenCalledWith("o-1");
    expect(mocks.markSent).toHaveBeenCalledWith("o-2");
  });

  it("calls pruneSent at the end of the tick", async () => {
    await runSyncTick();
    expect(mocks.pruneSent).toHaveBeenCalled();
  });

  // `stats.pushed++` counted one per successful tick rather than per row, so the
  // telemetry said "pushed: 1" on every idle tick and could not answer the one
  // question that matters during an incident: is data actually moving?
  describe("telemetry", () => {
    it("counts rows pushed, not ticks", async () => {
      mocks.dequeueBatch.mockResolvedValue([
        outboxRow({ id: "o-1", rowId: "p-1" }),
        outboxRow({ id: "o-2", rowId: "p-2" }),
        outboxRow({ id: "o-3", rowId: "p-3" }),
      ]);

      const stats = await runSyncTick();

      expect(stats.pushed).toBe(3);
    });

    it("reports zero pushed on an idle tick", async () => {
      const stats = await runSyncTick();
      expect(stats.pushed).toBe(0);
    });

    it("counts rows that failed to push", async () => {
      cloud = makeFakeCloudClient({
        pushBatch: vi.fn().mockRejectedValue(new Error("nope")),
        pushRow: vi.fn().mockRejectedValue(new Error("nope")),
      });
      mocks.dequeueBatch.mockResolvedValue([outboxRow()]);

      const stats = await runSyncTick();

      expect(stats.failed).toBe(1);
      expect(stats.pushed).toBe(0);
    });
  });
});

// The tick fired every 5s regardless: ~10 handlers × 12 ticks/minute is roughly
// 170k Supabase requests a day on a lab that is idle overnight, against a free
// tier, with no let-up when the cloud is unreachable.
describe("nextDelayMs", () => {
  it("stays at the base interval while data is moving", () => {
    expect(nextDelayMs({ idle: false, unreachable: false, previousDelayMs: 40_000 })).toBe(
      BASE_TICK_MS,
    );
  });

  it("backs off while idle", () => {
    const first = nextDelayMs({ idle: true, unreachable: false, previousDelayMs: BASE_TICK_MS });
    expect(first).toBeGreaterThan(BASE_TICK_MS);
  });

  it("caps the idle interval so the lab still picks up work promptly", () => {
    let delay = BASE_TICK_MS;
    for (let i = 0; i < 20; i++) {
      delay = nextDelayMs({ idle: true, unreachable: false, previousDelayMs: delay });
    }
    expect(delay).toBe(MAX_IDLE_TICK_MS);
  });

  it("backs off further when the cloud is unreachable", () => {
    let delay = BASE_TICK_MS;
    for (let i = 0; i < 20; i++) {
      delay = nextDelayMs({ idle: true, unreachable: true, previousDelayMs: delay });
    }
    expect(delay).toBe(MAX_OFFLINE_TICK_MS);
  });

  it("returns to the base interval the moment work appears again", () => {
    expect(nextDelayMs({ idle: false, unreachable: false, previousDelayMs: MAX_OFFLINE_TICK_MS })).toBe(
      BASE_TICK_MS,
    );
  });
});
