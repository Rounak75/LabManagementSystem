import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  countResult: 0,
  prismaMock: {
    invoice: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@main/db", () => ({ prisma: () => mocks.prismaMock }));

import { assertWithinDailyCap, DailyCapExceededError, DAILY_CAP } from "../daily-cap";

beforeEach(() => {
  mocks.countResult = 0;
  mocks.prismaMock.invoice.count.mockReset();
  mocks.prismaMock.invoice.count.mockImplementation(async () => mocks.countResult);
});

describe("assertWithinDailyCap", () => {
  it("resolves when count is 0", async () => {
    mocks.countResult = 0;
    await expect(assertWithinDailyCap()).resolves.toBeUndefined();
  });

  it("resolves when count is 49 (one below cap)", async () => {
    mocks.countResult = 49;
    await expect(assertWithinDailyCap()).resolves.toBeUndefined();
  });

  it("throws DailyCapExceededError when count equals DAILY_CAP (50)", async () => {
    mocks.countResult = 50;
    await expect(assertWithinDailyCap()).rejects.toThrow(DailyCapExceededError);
  });

  it("throws DailyCapExceededError when count exceeds DAILY_CAP", async () => {
    mocks.countResult = 99;
    await expect(assertWithinDailyCap()).rejects.toThrow(DailyCapExceededError);
  });

  it("error message is DAILY_CAP_EXCEEDED", async () => {
    mocks.countResult = 50;
    await expect(assertWithinDailyCap()).rejects.toThrow("DAILY_CAP_EXCEEDED");
  });

  it("queries invoices with razorpayPaymentLinkId or razorpayQrId set, updatedAt >= startOfTodayUTC", async () => {
    mocks.countResult = 0;
    await assertWithinDailyCap();

    expect(mocks.prismaMock.invoice.count).toHaveBeenCalledOnce();
    const [args] = mocks.prismaMock.invoice.count.mock.calls[0]!;
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { razorpayPaymentLinkId: { not: null } },
        { razorpayQrId: { not: null } },
      ])
    );
    expect(args.where.updatedAt.gte).toBeInstanceOf(Date);
    // The gte date should be today at UTC midnight (hours === 0)
    const gte: Date = args.where.updatedAt.gte;
    expect(gte.getUTCHours()).toBe(0);
    expect(gte.getUTCMinutes()).toBe(0);
    expect(gte.getUTCSeconds()).toBe(0);
    expect(gte.getUTCMilliseconds()).toBe(0);
  });

  it("DAILY_CAP constant is 50", () => {
    expect(DAILY_CAP).toBe(50);
  });
});
