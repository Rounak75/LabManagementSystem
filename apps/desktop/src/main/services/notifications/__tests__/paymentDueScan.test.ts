import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueIds: [] as string[],
  prismaMock: {
    labSettings: { findFirst: vi.fn() },
    visit: { findMany: vi.fn() },
    notification: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
  },
}));

vi.mock("@main/db", () => ({ prisma: () => mocks.prismaMock }));

import { paymentDueScan } from "../triggers";

beforeEach(() => {
  mocks.enqueueIds = [];
  mocks.prismaMock.labSettings.findFirst.mockReset();
  mocks.prismaMock.visit.findMany.mockReset();
  mocks.prismaMock.notification.create.mockReset();
  mocks.prismaMock.notification.count.mockResolvedValue(0);
  mocks.prismaMock.notification.create.mockImplementation(async ({ data }: any) => {
    const id = `n${mocks.enqueueIds.length + 1}`;
    mocks.enqueueIds.push(id);
    return { id, ...data };
  });
});

describe("paymentDueScan", () => {
  it("returns 0 when notifications disabled", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: false });
    const n = await paymentDueScan();
    expect(n).toBe(0);
    expect(mocks.prismaMock.visit.findMany).not.toHaveBeenCalled();
  });

  it("enqueues SMS for each unpaid 3+-day-old visit", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: true });
    mocks.prismaMock.visit.findMany.mockResolvedValue([
      { id: "v1", patientId: "p1", patient: { phone: "98xxx" }, invoice: { paymentStatus: "Pending" } },
      { id: "v2", patientId: "p2", patient: { phone: "98yyy" }, invoice: { paymentStatus: "Partial" } },
    ]);
    const n = await paymentDueScan();
    expect(n).toBe(2);
    expect(mocks.enqueueIds.length).toBe(2);
  });

  it("skips visits where patient has no phone", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: true });
    mocks.prismaMock.visit.findMany.mockResolvedValue([
      { id: "v3", patientId: "p3", patient: { phone: null }, invoice: { paymentStatus: "Pending" } },
    ]);
    const n = await paymentDueScan();
    expect(n).toBe(0);
  });

  it("passes the correct Prisma filter (3-day cutoff, status Completed, not deleted, no prior PaymentDue, unpaid)", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: true });
    mocks.prismaMock.visit.findMany.mockResolvedValue([]);
    await paymentDueScan();
    expect(mocks.prismaMock.visit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "Completed",
        visitDate: expect.objectContaining({ lte: expect.any(Date) }),
        deletedAt: null,
        invoice: { paymentStatus: { in: ["Pending", "Partial"] } },
        notifications: { none: { purpose: "PaymentDue" } },
      }),
    }));
  });
});
