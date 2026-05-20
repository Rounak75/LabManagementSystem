import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  notifications: [] as any[],
  prismaMock: {
    labSettings: { findFirst: vi.fn() },
    visit: { findUnique: vi.fn() },
    notification: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@main/db", () => ({ prisma: () => mocks.prismaMock }));

import { reportReady } from "../triggers";

beforeEach(() => {
  mocks.notifications = [];
  mocks.prismaMock.labSettings.findFirst.mockReset();
  mocks.prismaMock.visit.findUnique.mockReset();
  mocks.prismaMock.notification.create.mockReset();
  mocks.prismaMock.notification.count.mockResolvedValue(0);
  mocks.prismaMock.notification.create.mockImplementation(async ({ data }: any) => {
    const row = { id: `n${mocks.notifications.length + 1}`, ...data };
    mocks.notifications.push(row);
    return row;
  });
});

describe("reportReady integration", () => {
  it("enqueues SMS + Email Pending for paid visit with email", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true, emailEnabled: true,
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v1",
      patientId: "p1",
      patient: { id: "p1", phone: "98xxx", email: "ravi@example.com" },
      invoice: { paymentStatus: "Paid" },
    });
    const ids = await reportReady("v1");
    expect(ids.length).toBe(2);
    expect(mocks.notifications.find(n => n.channel === "SMS")?.status).toBe("Pending");
    expect(mocks.notifications.find(n => n.channel === "Email")?.status).toBe("Pending");
  });

  it("makes Email WaitingForPayment when invoice not yet paid", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true, emailEnabled: true,
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v2",
      patientId: "p2",
      patient: { id: "p2", phone: "98yyy", email: "sita@example.com" },
      invoice: { paymentStatus: "Pending" },  // real value, NOT "Unpaid"
    });
    await reportReady("v2");
    expect(mocks.notifications.find(n => n.channel === "Email")?.status).toBe("WaitingForPayment");
  });
});
