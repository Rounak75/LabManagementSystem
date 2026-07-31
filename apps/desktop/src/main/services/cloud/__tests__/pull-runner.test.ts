import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  deadLetterUpsert: vi.fn(),
  deadLetterFindMany: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpdate: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: {
      upsert: mocks.deadLetterUpsert,
      findUnique: mocks.deadLetterFindUnique,
      findMany: mocks.deadLetterFindMany,
      update: mocks.deadLetterUpdate,
    },
  }),
}));

import { runPull, MAX_ROW_ATTEMPTS } from "../pull-runner";

interface Row extends Record<string, unknown> {
  id: string;
  updated_at: string;
}

function row(id: string, updatedAt = "2026-05-20T10:00:00Z"): Row {
  return { id, updated_at: updatedAt };
}

function spec(applyRow: (r: Row) => Promise<void>) {
  return {
    source: "widgets",
    table: "widgets",
    cursorColumn: "updated_at" as const,
    applyRow,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindMany.mockResolvedValue([]);
  mocks.deadLetterUpdate.mockResolvedValue(undefined);
});

describe("runPull", () => {
  it("queries the cloud from the stored cursor", async () => {
    mocks.syncCursorFindUnique.mockResolvedValue({
      lastSyncedAt: new Date("2026-05-20T09:00:00Z"),
      lastId: "w9",
    });
    const cloud = makeFakeCloudClient();

    await runPull(cloud, spec(async () => {}));

    expect(cloud.pullSince).toHaveBeenCalledWith(
      "widgets",
      "updated_at",
      "2026-05-20T09:00:00.000Z",
      100,
      undefined,
      "w9",
    );
  });

  it("applies every row and advances the cursor to the last one", async () => {
    const applied: string[] = [];
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        row("w1", "2026-05-20T10:00:00Z"),
        row("w2", "2026-05-20T11:00:00Z"),
      ]),
    });

    await runPull(cloud, spec(async (r) => void applied.push(r.id)));

    expect(applied).toEqual(["w1", "w2"]);
    const arg = mocks.syncCursorUpsert.mock.calls[0]![0];
    expect((arg.update.lastSyncedAt as Date).toISOString()).toBe("2026-05-20T11:00:00.000Z");
    expect(arg.update.lastId).toBe("w2");
  });

  it("does not touch the cursor when the cloud returns nothing", async () => {
    await runPull(makeFakeCloudClient(), spec(async () => {}));
    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });

  // The bug this exists to prevent: one row that always fails used to rethrow,
  // which skipped the cursor write, so the same batch was re-fetched every 5s
  // forever and no later row ever arrived.
  describe("a row that keeps failing", () => {
    const boom = async (r: Row) => {
      if (r.id === "bad") throw new Error("constraint exploded");
    };

    it("still applies the rows after it", async () => {
      const applied: string[] = [];
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([row("bad"), row("good")]),
      });

      await runPull(
        cloud,
        spec(async (r) => {
          await boom(r);
          applied.push(r.id);
        }),
      );

      expect(applied).toEqual(["good"]);
    });

    it("records it as a dead letter with the row payload", async () => {
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row("bad")]) });

      await runPull(cloud, spec(boom));

      expect(mocks.deadLetterUpsert).toHaveBeenCalledOnce();
      const arg = mocks.deadLetterUpsert.mock.calls[0]![0];
      expect(arg.where).toEqual({ source_rowId: { source: "widgets", rowId: "bad" } });
      expect(arg.create.error).toContain("constraint exploded");
      expect(JSON.parse(arg.create.payload as string).id).toBe("bad");
    });

    it("holds the cursor back until it has been retried MAX_ROW_ATTEMPTS times", async () => {
      mocks.deadLetterFindUnique.mockResolvedValue({ attempts: 1 });
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row("bad")]) });

      await runPull(cloud, spec(boom));

      // A transient failure deserves another go before we give up on the row.
      expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
    });

    it("advances past it once it has exhausted its retries", async () => {
      mocks.deadLetterFindUnique.mockResolvedValue({ attempts: MAX_ROW_ATTEMPTS });
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row("bad")]) });

      await runPull(cloud, spec(boom));

      expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
      expect(mocks.syncCursorUpsert.mock.calls[0]![0].update.lastId).toBe("bad");
    });

    it("reports the failure to the caller", async () => {
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row("bad")]) });

      const stats = await runPull(cloud, spec(boom));

      expect(stats.failed).toBe(1);
      expect(stats.applied).toBe(0);
    });
  });

  // A missing or renamed client method used to be swallowed by the same catch as
  // "cloud unreachable", so a programming error looked like an offline blip and
  // sync quietly did nothing.
  it("propagates a fetch failure instead of reporting success", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockRejectedValue(new Error("fetch failed")),
    });

    await expect(runPull(cloud, spec(async () => {}))).rejects.toThrow("fetch failed");
    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });

  it("passes filters and batch size through to the cloud query", async () => {
    const cloud = makeFakeCloudClient();

    await runPull(cloud, {
      ...spec(async () => {}),
      filters: { status: "Queued" },
      batchSize: 25,
    });

    expect(cloud.pullSince).toHaveBeenCalledWith(
      "widgets",
      "updated_at",
      new Date(0).toISOString(),
      25,
      { status: "Queued" },
      undefined,
    );
  });

  it("skips rows the handler declines, still advancing the cursor", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([row("skip-me", "2026-05-20T12:00:00Z")]),
    });

    const stats = await runPull(cloud, {
      ...spec(async () => {}),
      shouldApply: () => false,
    });

    expect(stats.skipped).toBe(1);
    expect(stats.applied).toBe(0);
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  // The cursor is a (timestamp, id) pair used for tie-breaking. Moving the id
  // without the timestamp would leave it pointing at a position that never
  // existed, which can skip rows sharing that timestamp.
  it("leaves the cursor alone for a row whose cursor column is null", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([{ id: "w1", updated_at: null }]),
    });

    await runPull(cloud, spec(async () => {}));

    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });

  it("clears a dead letter once the row finally applies", async () => {
    mocks.deadLetterFindUnique.mockResolvedValue({ attempts: 2 });
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row("w1")]) });

    await runPull(cloud, spec(async () => {}));

    const arg = mocks.deadLetterUpsert.mock.calls[0]![0];
    expect(arg.update.resolvedAt).toBeInstanceOf(Date);
  });

  // Quarantining lets the cursor move past a row that will not apply, so one bad
  // row cannot stop the stream. The cost is that the row is then behind the
  // cursor: once the reason it failed is fixed, nothing ever looked at it again
  // and the work it carried was gone. A quarantined result is a value a staff
  // member typed for a patient.
  describe("replaying quarantined rows", () => {
    it("re-applies a stuck row and marks it resolved", async () => {
      mocks.deadLetterFindMany.mockResolvedValue([
        { source: "widgets", rowId: "stuck-1", payload: JSON.stringify({ id: "stuck-1" }), resolvedAt: null },
      ]);
      mocks.deadLetterFindUnique.mockResolvedValue({ resolvedAt: null });
      const applyRow = vi.fn().mockResolvedValue(undefined);

      await runPull(makeFakeCloudClient(), { source: "widgets", table: "widgets", cursorColumn: "updated_at", applyRow });

      expect(applyRow).toHaveBeenCalledWith({ id: "stuck-1" });
      expect(mocks.deadLetterUpsert).toHaveBeenCalled();
    });

    it("leaves a row that still fails quarantined, without counting a new failure", async () => {
      mocks.deadLetterFindMany.mockResolvedValue([
        { source: "widgets", rowId: "stuck-1", payload: JSON.stringify({ id: "stuck-1" }), resolvedAt: null },
      ]);
      const applyRow = vi.fn().mockRejectedValue(new Error("still broken"));

      await runPull(makeFakeCloudClient(), { source: "widgets", table: "widgets", cursorColumn: "updated_at", applyRow });

      expect(applyRow).toHaveBeenCalledOnce();
      expect(mocks.deadLetterUpsert).not.toHaveBeenCalled();
    });

    it("only considers rows whose cooldown has elapsed", async () => {
      const applyRow = vi.fn().mockResolvedValue(undefined);

      await runPull(makeFakeCloudClient(), { source: "widgets", table: "widgets", cursorColumn: "updated_at", applyRow });

      // Replaying every stuck row on every tick meant a row whose parents are
      // never coming was retried around seventeen thousand times a day, for
      // the life of the install. It waits its turn now.
      const where = mocks.deadLetterFindMany.mock.calls[0]?.[0]?.where;
      expect(where.lastSeenAt.lt).toBeInstanceOf(Date);
      expect(where.lastSeenAt.lt.getTime()).toBeLessThan(Date.now());
    });

    it("restarts the cooldown of a row that fails again, without counting a failure", async () => {
      mocks.deadLetterFindMany.mockResolvedValue([
        { source: "widgets", rowId: "stuck-1", payload: JSON.stringify({ id: "stuck-1" }), resolvedAt: null },
      ]);
      const applyRow = vi.fn().mockRejectedValue(new Error("still broken"));

      await runPull(makeFakeCloudClient(), { source: "widgets", table: "widgets", cursorColumn: "updated_at", applyRow });

      expect(mocks.deadLetterUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastSeenAt: expect.any(Date) }) }),
      );
      // The attempt count records what the pull did, not the replay.
      expect(mocks.deadLetterUpsert).not.toHaveBeenCalled();
    });

    it("ignores a dead letter whose payload cannot be read", async () => {
      mocks.deadLetterFindMany.mockResolvedValue([
        { source: "widgets", rowId: "bad", payload: "not json", resolvedAt: null },
      ]);
      const applyRow = vi.fn();

      await runPull(makeFakeCloudClient(), { source: "widgets", table: "widgets", cursorColumn: "updated_at", applyRow });

      expect(applyRow).not.toHaveBeenCalled();
    });
  });
});
