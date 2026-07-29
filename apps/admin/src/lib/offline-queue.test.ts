import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  enqueue,
  dequeueOne,
  listPending,
  clearExpired,
  markError,
  markSent,
  ItemStatus,
  MAX_ATTEMPTS,
} from "./offline-queue";

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

  // A failure used to set the status to Error, and dequeueOne only ever looked
  // at Pending — so one timeout or 500, the most likely thing to happen on lab
  // mobile data, retired a result a staff member had typed. It stayed in the
  // queue, counted in "waiting to sync", and was never sent again.
  it("retries an item that failed to send", async () => {
    await enqueue({ kind: "result.upsert", body: { value: "12.5" } });
    const first = await dequeueOne();
    await markError(first!.id, "network timeout");

    const retried = await dequeueOne();

    expect(retried).not.toBeNull();
    expect(retried!.id).toBe(first!.id);
    expect(retried!.attempts).toBe(2);
  });

  // One item the server will never accept must not sit at the head of the queue
  // blocking every result typed after it.
  it("gives up on an item after the retry limit and moves to the next", async () => {
    await enqueue({ kind: "result.upsert", body: { value: "bad" } });
    await enqueue({ kind: "result.upsert", body: { value: "good" } });

    let poisoned: string | null = null;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const item = await dequeueOne();
      poisoned = item!.id;
      await markError(item!.id, "rejected");
    }

    const next = await dequeueOne();

    expect(next!.id).not.toBe(poisoned);
    expect((next!.body as { value: string }).value).toBe("good");
  });

  it("keeps a failed item visible in the pending count", async () => {
    await enqueue({ kind: "result.upsert", body: { value: "1" } });
    const item = await dequeueOne();
    await markError(item!.id, "boom");

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe(ItemStatus.Error);
  });

  it("drops an item once it has been sent", async () => {
    await enqueue({ kind: "result.upsert", body: { value: "1" } });
    const item = await dequeueOne();
    await markSent(item!.id);

    expect(await listPending()).toHaveLength(0);
    expect(await dequeueOne()).toBeNull();
  });
});
