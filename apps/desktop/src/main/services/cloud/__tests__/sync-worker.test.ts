import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  dequeueBatch: vi.fn(),
  markSent: vi.fn(),
  scheduleRetry: vi.fn(),
  pruneSent: vi.fn(),
  pushRow: vi.fn(),
  decryptSecret: vi.fn((s: string) => s.replace("enc:", "")),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({ labSettings: { findUnique: mocks.labSettingsFindUnique } }),
}));
vi.mock("../outbox.service", () => ({
  dequeueBatch: mocks.dequeueBatch,
  markSent: mocks.markSent,
  scheduleRetry: mocks.scheduleRetry,
  pruneSent: mocks.pruneSent,
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../supabase-client", () => ({
  createSupabaseClient: () => ({ pushRow: mocks.pushRow }),
}));

import { runSyncTick } from "../sync-worker";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    cloudSyncEnabled: true,
    supabaseUrl: "https://x.supabase.co",
    supabaseAnonKey: "a",
    supabaseServiceKey: "enc:s",
  });
  mocks.pruneSent.mockResolvedValue(0);
});

describe("runSyncTick", () => {
  it("no-op when sync disabled", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false });
    await runSyncTick();
    expect(mocks.dequeueBatch).not.toHaveBeenCalled();
  });

  it("pushes each row and marks sent on success", async () => {
    mocks.dequeueBatch.mockResolvedValue([
      { id: "o-1", tableName: "patients", operation: "create", rowId: "p-1", payload: '{"id":"p-1"}', attempts: 0 },
      { id: "o-2", tableName: "visits", operation: "update", rowId: "v-1", payload: '{"id":"v-1"}', attempts: 0 },
    ]);
    mocks.pushRow.mockResolvedValue(undefined);
    await runSyncTick();
    expect(mocks.pushRow).toHaveBeenCalledTimes(2);
    expect(mocks.markSent).toHaveBeenCalledWith("o-1");
    expect(mocks.markSent).toHaveBeenCalledWith("o-2");
  });

  it("schedules retry on push failure (per-row, doesn't break the tick)", async () => {
    mocks.dequeueBatch.mockResolvedValue([
      { id: "o-1", tableName: "patients", operation: "create", rowId: "p-1", payload: '{"id":"p-1"}', attempts: 0 },
      { id: "o-2", tableName: "patients", operation: "create", rowId: "p-2", payload: '{"id":"p-2"}', attempts: 0 },
    ]);
    mocks.pushRow.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    await runSyncTick();
    expect(mocks.scheduleRetry).toHaveBeenCalledWith(expect.objectContaining({ id: "o-1" }), expect.any(Error));
    expect(mocks.markSent).toHaveBeenCalledWith("o-2");
  });

  it("compaction: later updates to same (tableName, rowId) supersede earlier ones", async () => {
    mocks.dequeueBatch.mockResolvedValue([
      { id: "o-1", tableName: "patients", operation: "update", rowId: "p-1", payload: '{"id":"p-1","v":1}', attempts: 0, createdAt: new Date(1) },
      { id: "o-2", tableName: "patients", operation: "update", rowId: "p-1", payload: '{"id":"p-1","v":2}', attempts: 0, createdAt: new Date(2) },
    ]);
    mocks.pushRow.mockResolvedValue(undefined);
    await runSyncTick();
    expect(mocks.pushRow).toHaveBeenCalledTimes(1);
    expect(mocks.pushRow).toHaveBeenCalledWith(expect.objectContaining({ payload: { id: "p-1", v: 2 } }));
    expect(mocks.markSent).toHaveBeenCalledWith("o-1");
    expect(mocks.markSent).toHaveBeenCalledWith("o-2");
  });

  it("calls pruneSent at the end of the tick", async () => {
    mocks.dequeueBatch.mockResolvedValue([]);
    await runSyncTick();
    expect(mocks.pruneSent).toHaveBeenCalled();
  });
});
