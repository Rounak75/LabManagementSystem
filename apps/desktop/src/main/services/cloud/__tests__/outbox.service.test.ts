import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @main/db ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const outbox = {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };
  return { outbox, prisma: vi.fn(() => ({ outbox })) };
});

vi.mock("@main/db", () => ({ prisma: mocks.prisma }));

import {
  MAX_RETRIES,
  OUTBOX_BATCH_SIZE,
  retryDelayMs,
  enqueue,
  dequeueBatch,
  markSent,
  scheduleRetry,
  pruneSent,
  failedCount,
  pendingCount,
} from "../outbox.service";

// ─── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults so tests that don't care about return values don't throw
  mocks.outbox.create.mockResolvedValue({});
  mocks.outbox.findMany.mockResolvedValue([]);
  mocks.outbox.update.mockResolvedValue({});
  mocks.outbox.deleteMany.mockResolvedValue({ count: 0 });
  mocks.outbox.count.mockResolvedValue(0);
});

// ─── Constants ─────────────────────────────────────────────────────────────────

describe("MAX_RETRIES / OUTBOX_BATCH_SIZE", () => {
  it("MAX_RETRIES is 5", () => {
    expect(MAX_RETRIES).toBe(5);
  });

  it("OUTBOX_BATCH_SIZE is 100", () => {
    expect(OUTBOX_BATCH_SIZE).toBe(100);
  });
});

// ─── retryDelayMs ──────────────────────────────────────────────────────────────

describe("retryDelayMs", () => {
  it("attempt 1 → 30_000", () => expect(retryDelayMs(1)).toBe(30_000));
  it("attempt 2 → 120_000", () => expect(retryDelayMs(2)).toBe(120_000));
  it("attempt 3 → 600_000", () => expect(retryDelayMs(3)).toBe(600_000));
  it("attempt 4 → 3_600_000", () => expect(retryDelayMs(4)).toBe(3_600_000));
  it("attempt 5 → 21_600_000", () => expect(retryDelayMs(5)).toBe(21_600_000));
  it("attempt 6 (> MAX_RETRIES) → null", () => expect(retryDelayMs(6)).toBeNull());
  it("attempt 0 → null", () => expect(retryDelayMs(0)).toBeNull());
  it("attempt -1 → null", () => expect(retryDelayMs(-1)).toBeNull());
});

// ─── enqueue ───────────────────────────────────────────────────────────────────

describe("enqueue", () => {
  it("calls prisma().outbox.create with correct shape", async () => {
    await enqueue({ tableName: "patients", operation: "create", rowId: "r1", payload: { id: "r1" } });

    expect(mocks.outbox.create).toHaveBeenCalledOnce();
    const { data } = mocks.outbox.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data.tableName).toBe("patients");
    expect(data.operation).toBe("create");
    expect(data.rowId).toBe("r1");
    expect(data.payload).toBe(JSON.stringify({ id: "r1" }));
    expect(data.status).toBe("Pending");
    expect(data.attempts).toBe(0);
    expect(data.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("stringifies null payload when payload is undefined", async () => {
    await enqueue({ tableName: "patients", operation: "delete", rowId: "r2", payload: undefined });
    const { data } = mocks.outbox.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data.payload).toBe("null");
  });

  it("stringifies null payload when payload is null", async () => {
    await enqueue({ tableName: "patients", operation: "delete", rowId: "r3", payload: null });
    const { data } = mocks.outbox.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data.payload).toBe("null");
  });
});

// ─── dequeueBatch ──────────────────────────────────────────────────────────────

describe("dequeueBatch", () => {
  it("calls findMany with status Pending, lte now, orderBy createdAt asc, take 100", async () => {
    const before = new Date();
    await dequeueBatch();
    const after = new Date();

    expect(mocks.outbox.findMany).toHaveBeenCalledOnce();
    const arg = mocks.outbox.findMany.mock.calls[0]![0] as {
      where: { status: string; nextAttemptAt: { lte: Date } };
      orderBy: { createdAt: string };
      take: number;
    };
    expect(arg.where.status).toBe("Pending");
    expect(arg.where.nextAttemptAt.lte).toBeInstanceOf(Date);
    expect(arg.where.nextAttemptAt.lte.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(arg.where.nextAttemptAt.lte.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(arg.orderBy).toEqual({ createdAt: "asc" });
    expect(arg.take).toBe(100);
  });
});

// ─── markSent ──────────────────────────────────────────────────────────────────

describe("markSent", () => {
  it("updates row to status Sent with a sentAt date", async () => {
    await markSent("row-1");

    expect(mocks.outbox.update).toHaveBeenCalledOnce();
    const arg = mocks.outbox.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { status: string; sentAt: Date };
    };
    expect(arg.where.id).toBe("row-1");
    expect(arg.data.status).toBe("Sent");
    expect(arg.data.sentAt).toBeInstanceOf(Date);
  });
});

// ─── scheduleRetry ─────────────────────────────────────────────────────────────

describe("scheduleRetry", () => {
  it("increments attempts and sets nextAttemptAt for attempt 1", async () => {
    const row = { id: "row-1", attempts: 0 };
    const err = new Error("timeout");
    const before = Date.now();

    await scheduleRetry(row, err);

    const arg = mocks.outbox.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { attempts: number; nextAttemptAt: Date; error: string };
    };
    expect(arg.where.id).toBe("row-1");
    expect(arg.data.attempts).toBe(1);
    expect(arg.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 30_000);
    expect(arg.data.error).toBe("timeout");
    // status should NOT be set (not Failed yet)
    expect((arg.data as Record<string, unknown>).status).toBeUndefined();
  });

  it("sets status Failed when next attempt would exceed MAX_RETRIES", async () => {
    // attempts is already MAX_RETRIES, so nextAttempt = MAX_RETRIES + 1 → null delay
    const row = { id: "row-2", attempts: MAX_RETRIES };
    const err = new Error("permanent failure");

    await scheduleRetry(row, err);

    const arg = mocks.outbox.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { status: string; attempts: number; error: string };
    };
    expect(arg.data.status).toBe("Failed");
    expect(arg.data.attempts).toBe(MAX_RETRIES + 1);
    expect(arg.data.error).toBe("permanent failure");
  });

  it("uses correct delay for attempt 3", async () => {
    const row = { id: "row-3", attempts: 2 }; // nextAttempt = 3
    const err = new Error("err");
    const before = Date.now();

    await scheduleRetry(row, err);

    const arg = mocks.outbox.update.mock.calls[0]![0] as {
      data: { nextAttemptAt: Date };
    };
    // delay for attempt 3 is 600_000
    expect(arg.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 600_000);
  });
});

// ─── pruneSent ─────────────────────────────────────────────────────────────────

describe("pruneSent", () => {
  it("deletes Sent rows older than 7 days and returns count", async () => {
    mocks.outbox.deleteMany.mockResolvedValue({ count: 3 });
    const before = Date.now();

    const count = await pruneSent();

    expect(count).toBe(3);
    expect(mocks.outbox.deleteMany).toHaveBeenCalledOnce();
    const arg = mocks.outbox.deleteMany.mock.calls[0]![0] as {
      where: { status: string; sentAt: { lt: Date } };
    };
    expect(arg.where.status).toBe("Sent");
    expect(arg.where.sentAt.lt).toBeInstanceOf(Date);
    // cutoff should be roughly 7 days ago
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(arg.where.sentAt.lt.getTime()).toBeLessThanOrEqual(before - sevenDaysMs + 1000);
  });
});

// ─── failedCount / pendingCount ────────────────────────────────────────────────

describe("failedCount", () => {
  it("counts rows with status Failed", async () => {
    mocks.outbox.count.mockResolvedValue(7);
    const result = await failedCount();
    expect(result).toBe(7);
    expect(mocks.outbox.count).toHaveBeenCalledWith({ where: { status: "Failed" } });
  });
});

describe("pendingCount", () => {
  it("counts rows with status Pending", async () => {
    mocks.outbox.count.mockResolvedValue(42);
    const result = await pendingCount();
    expect(result).toBe(42);
    expect(mocks.outbox.count).toHaveBeenCalledWith({ where: { status: "Pending" } });
  });
});
