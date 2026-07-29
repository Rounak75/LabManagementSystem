import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  deadLetterFindMany: vi.fn(),
  syncCursorUpsert: vi.fn(),
  visitFindUnique: vi.fn(),
  visitUpdate: vi.fn(),
  visitTestFindMany: vi.fn(),
  visitTestUpdateMany: vi.fn(),
  reportReady: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: { findUnique: mocks.deadLetterFindUnique, upsert: mocks.deadLetterUpsert, findMany: mocks.deadLetterFindMany },
    visit: { findUnique: mocks.visitFindUnique, update: mocks.visitUpdate },
    visitTest: { findMany: mocks.visitTestFindMany, updateMany: mocks.visitTestUpdateMany },
  }),
}));
vi.mock("@main/services/notifications/triggers", () => ({ reportReady: mocks.reportReady }));

import { pullVerifications } from "../pull-verifications";
import { MAX_ROW_ATTEMPTS } from "../pull-runner";

const row = {
  id: "v1",
  visit_id: "VIS-2026-00001",
  source: "admin",
  verified_by_user_id: "u1",
  verified_at: "2026-05-20T12:00:00Z",
  updated_at: "2026-05-20T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindMany.mockResolvedValue([]);
  mocks.visitFindUnique.mockResolvedValue({ id: "v1", status: "InProgress" });
  mocks.visitTestFindMany.mockResolvedValue([]);
  mocks.reportReady.mockResolvedValue([]);
});

describe("pullVerifications", () => {
  it("asks only for admin-source visits on the verified_at cursor", async () => {
    const cloud = makeFakeCloudClient();
    await pullVerifications(cloud);
    expect(cloud.pullSince).toHaveBeenCalledWith(
      "visits",
      "verified_at",
      new Date(0).toISOString(),
      100,
      { source: "admin" },
      undefined,
    );
  });

  it("locks tests, completes the visit, and fires reportReady on a new verify", async () => {
    mocks.visitTestFindMany.mockResolvedValue([{ id: "vt1", isLocked: false, verifiedAt: null }]);
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row]) });

    await pullVerifications(cloud);

    expect(mocks.visitTestUpdateMany).toHaveBeenCalledOnce();
    const arg = mocks.visitTestUpdateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ visitId: "v1" });
    expect(arg.data.isLocked).toBe(true);
    expect(arg.data.status).toBe("Ready");
    expect(arg.data.verifiedById).toBe("u1");
    expect((arg.data.verifiedAt as Date).toISOString()).toBe("2026-05-20T12:00:00.000Z");

    expect(mocks.visitUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { status: "Completed" },
    });
    expect(mocks.reportReady).toHaveBeenCalledOnce();
    expect(mocks.reportReady).toHaveBeenCalledWith("v1");
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("is idempotent: an already locked-and-verified visit does not re-notify", async () => {
    mocks.visitTestFindMany.mockResolvedValue([
      { id: "vt1", isLocked: true, verifiedAt: new Date("2026-05-20T12:00:00Z") },
    ]);
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row]) });

    await pullVerifications(cloud);

    expect(mocks.visitTestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.visitUpdate).not.toHaveBeenCalled();
    expect(mocks.reportReady).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce(); // cursor still advances
  });

  // A verification whose visit had not arrived yet used to be counted as applied,
  // so the cursor moved past it and no later tick ever looked at it again. The
  // visit stayed unverified on the lab PC, never reached the Reports list to be
  // printed, and the patient was never told their report was ready.
  it("holds the cursor and retries when the visit has not synced yet", async () => {
    mocks.visitFindUnique.mockResolvedValue(null);
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row]) });

    await pullVerifications(cloud);

    expect(mocks.visitTestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.reportReady).not.toHaveBeenCalled();
    expect(mocks.deadLetterUpsert).toHaveBeenCalledOnce();
    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });

  it("holds the cursor and retries when the visit's tests have not synced yet", async () => {
    mocks.visitTestFindMany.mockResolvedValue([]);
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row]) });

    await pullVerifications(cloud);

    expect(mocks.visitTestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });

  // Retrying must not become wedging: a visit that never arrives has to stop
  // blocking every later verification.
  it("quarantines the verification once retries are exhausted", async () => {
    mocks.visitFindUnique.mockResolvedValue(null);
    mocks.deadLetterFindUnique.mockResolvedValue({ attempts: MAX_ROW_ATTEMPTS - 1 });
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row]) });

    await pullVerifications(cloud);

    expect(mocks.deadLetterUpsert).toHaveBeenCalledOnce();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("skips rows that carry no verified_at", async () => {
    mocks.visitTestFindMany.mockResolvedValue([{ id: "vt1", isLocked: false, verifiedAt: null }]);
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([{ ...row, verified_at: null }]),
    });

    await pullVerifications(cloud);

    expect(mocks.visitTestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.reportReady).not.toHaveBeenCalled();
  });

  it("still locks the visit when the reportReady notification fails", async () => {
    mocks.visitTestFindMany.mockResolvedValue([{ id: "vt1", isLocked: false, verifiedAt: null }]);
    mocks.reportReady.mockRejectedValue(new Error("smtp down"));
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row]) });

    await pullVerifications(cloud);

    expect(mocks.visitTestUpdateMany).toHaveBeenCalledOnce();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });
});
