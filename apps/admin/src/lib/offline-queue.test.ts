import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { enqueue, dequeueOne, listPending, clearExpired, ItemStatus } from "./offline-queue";

beforeEach(async () => {
  const { clear } = await import("idb-keyval");
  await clear();
});

describe("offline-queue", () => {
  it("enqueues and lists pending items in order", async () => {
    await enqueue({ kind: "patient.create", body: { name: "A" } });
    await enqueue({ kind: "patient.create", body: { name: "B" } });
    const pending = await listPending();
    expect(pending.map((p) => (p.body as { name: string }).name)).toEqual(["A", "B"]);
    expect(pending[0]!.status).toBe(ItemStatus.Pending);
  });

  it("dequeueOne marks first pending as Sending and returns it", async () => {
    await enqueue({ kind: "patient.create", body: { name: "A" } });
    const item = await dequeueOne();
    expect(item?.status).toBe(ItemStatus.Sending);
  });

  it("clearExpired removes items older than 24h", async () => {
    await enqueue({ kind: "patient.create", body: { name: "Old" } });
    const { get, set, keys } = await import("idb-keyval");
    const allKeys = await keys();
    const queueKey = allKeys.find((k) => String(k).startsWith("queue:")) as string;
    const items = (await get(queueKey)) as { enqueuedAt: number }[];
    items[0]!.enqueuedAt = Date.now() - 25 * 60 * 60 * 1000;
    await set(queueKey, items);

    await clearExpired();
    const pending = await listPending();
    expect(pending.length).toBe(0);
  });
});
