import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaMock: {
    labSettings: { findFirst: vi.fn() },
    visit: { findUnique: vi.fn(), findMany: vi.fn() },
    invoice: { findUnique: vi.fn() },
    notification: { findFirst: vi.fn(), create: vi.fn() },
  },
  enqueueMock: vi.fn(),
  releaseWaitingForPaymentMock: vi.fn(),
  createLinkForInvoiceMock: vi.fn(),
}));

vi.mock("@main/db", () => ({ prisma: () => mocks.prismaMock }));
vi.mock("../queue", () => ({
  enqueue: mocks.enqueueMock,
  releaseWaitingForPayment: mocks.releaseWaitingForPaymentMock,
}));
vi.mock("@main/services/payments/link.service", () => ({
  createLinkForInvoice: mocks.createLinkForInvoiceMock,
}));

import { reportReady, visitBooked, paymentReceived } from "../triggers";

beforeEach(() => {
  mocks.prismaMock.labSettings.findFirst.mockReset();
  mocks.prismaMock.visit.findUnique.mockReset();
  mocks.prismaMock.visit.findMany.mockReset();
  mocks.prismaMock.invoice.findUnique.mockReset();
  mocks.prismaMock.notification.findFirst.mockReset();
  mocks.enqueueMock.mockReset();
  mocks.releaseWaitingForPaymentMock.mockReset();
  mocks.createLinkForInvoiceMock.mockReset();
});

describe("triggers.reportReady", () => {
  it("does nothing when notifications disabled", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: false });
    const ids = await reportReady("v1");
    expect(ids).toEqual([]);
    expect(mocks.enqueueMock).not.toHaveBeenCalled();
  });

  it("enqueues SMS + Email Pending when invoice paid and email present", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true, emailEnabled: true,
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v1",
      patientId: "p1",
      patient: { id: "p1", phone: "98xxx", email: "x@y.com" },
      invoice: { paymentStatus: "Paid" },
    });
    mocks.enqueueMock.mockResolvedValueOnce("n-sms").mockResolvedValueOnce("n-email");
    const ids = await reportReady("v1");
    expect(ids).toEqual(["n-sms", "n-email"]);
    expect(mocks.enqueueMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      channel: "SMS", status: "Pending",
    }));
    expect(mocks.enqueueMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      channel: "Email", status: "Pending",
    }));
  });

  it("enqueues Email as WaitingForPayment when invoice unpaid", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true, emailEnabled: true,
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v1",
      patientId: "p1",
      patient: { id: "p1", phone: "98xxx", email: "x@y.com" },
      invoice: { paymentStatus: "Unpaid" },
    });
    mocks.enqueueMock.mockResolvedValueOnce("n-sms").mockResolvedValueOnce("n-email");
    const ids = await reportReady("v1");
    expect(mocks.enqueueMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      channel: "Email", status: "WaitingForPayment",
    }));
    expect(ids).toEqual(["n-sms", "n-email"]);
  });

  it("skips email row when patient has no email", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true, emailEnabled: true,
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v1",
      patientId: "p1",
      patient: { id: "p1", phone: "98xxx", email: null },
      invoice: { paymentStatus: "Paid" },
    });
    mocks.enqueueMock.mockResolvedValueOnce("n-sms");
    const ids = await reportReady("v1");
    expect(ids).toEqual(["n-sms"]);
    expect(mocks.enqueueMock).toHaveBeenCalledTimes(1);
  });

  // ── Razorpay payment link creation ────────────────────────────────────────

  it("Case A: calls createLinkForInvoice when Razorpay is Test mode and invoice is unpaid", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: false,
      razorpayMode: "Test",
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v1",
      patientId: "p1",
      patient: { id: "p1", phone: "98xxx", email: null },
      invoice: { id: "inv-1", paymentStatus: "Pending" },
    });
    mocks.createLinkForInvoiceMock.mockResolvedValue({
      id: "link-1",
      shortUrl: "https://rzp.io/l/abc123",
      expiresAt: new Date(),
    });
    mocks.enqueueMock.mockResolvedValueOnce("n-sms");

    const ids = await reportReady("v1");

    expect(mocks.createLinkForInvoiceMock).toHaveBeenCalledWith("inv-1");
    expect(ids).toEqual(["n-sms"]);
    // SMS is still enqueued (the short URL is stored on the invoice for sender to use)
    expect(mocks.enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "SMS", status: "Pending" }),
    );
  });

  it("Case B: does NOT call createLinkForInvoice when razorpayMode is Off", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: false,
      razorpayMode: "Off",
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v2",
      patientId: "p2",
      patient: { id: "p2", phone: "98yyy", email: null },
      invoice: { id: "inv-2", paymentStatus: "Pending" },
    });
    mocks.enqueueMock.mockResolvedValueOnce("n-sms");

    const ids = await reportReady("v2");

    expect(mocks.createLinkForInvoiceMock).not.toHaveBeenCalled();
    expect(ids).toEqual(["n-sms"]);
    // Existing behaviour preserved — SMS still enqueued
    expect(mocks.enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "SMS", status: "Pending" }),
    );
  });

  it("Case C: still enqueues SMS when createLinkForInvoice throws (fallback path)", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: false,
      razorpayMode: "Test",
    });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v3",
      patientId: "p3",
      patient: { id: "p3", phone: "98zzz", email: null },
      invoice: { id: "inv-3", paymentStatus: "Partial" },
    });
    const err = new Error("DAILY_CAP_EXCEEDED");
    err.name = "DailyCapExceededError";
    mocks.createLinkForInvoiceMock.mockRejectedValue(err);
    mocks.enqueueMock.mockResolvedValueOnce("n-sms");

    // Should NOT throw even though link creation fails
    const ids = await reportReady("v3");

    expect(mocks.createLinkForInvoiceMock).toHaveBeenCalledWith("inv-3");
    expect(ids).toEqual(["n-sms"]);
    expect(mocks.enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("triggers.visitBooked", () => {
  it("enqueues a single SMS row", async () => {
    mocks.prismaMock.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: true });
    mocks.prismaMock.visit.findUnique.mockResolvedValue({
      id: "v2", patientId: "p2", patient: { phone: "98xxx" },
    });
    mocks.enqueueMock.mockResolvedValue("n-sms");
    const ids = await visitBooked("v2");
    expect(ids).toEqual(["n-sms"]);
    expect(mocks.enqueueMock).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "VisitBooked", channel: "SMS",
    }));
  });
});
