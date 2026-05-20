import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaMock: {
    invoice: { findUnique: vi.fn() },
    notification: { updateMany: vi.fn() },
  },
}));

vi.mock("@main/db", () => ({ prisma: () => mocks.prismaMock }));

import { paymentReceived } from "../triggers";

beforeEach(() => {
  mocks.prismaMock.invoice.findUnique.mockReset();
  mocks.prismaMock.notification.updateMany.mockReset();
});

describe("paymentReceived trigger", () => {
  it("returns 0 when invoice not found", async () => {
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(null);
    const n = await paymentReceived("inv-missing");
    expect(n).toBe(0);
    expect(mocks.prismaMock.notification.updateMany).not.toHaveBeenCalled();
  });

  it("releases WaitingForPayment email rows for the visit", async () => {
    mocks.prismaMock.invoice.findUnique.mockResolvedValue({ id: "inv1", visitId: "v1" });
    mocks.prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    const n = await paymentReceived("inv1");
    expect(n).toBe(1);
    expect(mocks.prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { visitId: "v1", purpose: "ReportReady", channel: "Email", status: "WaitingForPayment" },
      data: { status: "Pending", scheduledFor: expect.any(Date) },
    });
  });
});
