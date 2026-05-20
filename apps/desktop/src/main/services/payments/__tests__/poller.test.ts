import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  invoiceUpdate: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  fetchPaymentLink: vi.fn(),
  fetchQr: vi.fn(),
  decryptSecret: vi.fn((s: string) => s.replace("enc:", "")),
  markPaid: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    invoice: { findMany: mocks.findMany, update: mocks.invoiceUpdate },
    labSettings: { findUnique: mocks.labSettingsFindUnique },
  }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../razorpay-client", () => ({
  createRazorpayClient: () => ({
    fetchPaymentLink: mocks.fetchPaymentLink,
    fetchQr: mocks.fetchQr,
  }),
}));
vi.mock("../reconcile", () => ({ markPaid: mocks.markPaid }));

import { runPollTick, pollOne } from "../poller";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({
    razorpayMode: "Test",
    razorpayKeyId: "k",
    razorpayKeySecret: "enc:s",
  });
});

describe("poller.runPollTick", () => {
  it("reconciles paid links and ignores still-created ones", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "inv-1", razorpayPaymentLinkId: "plink_A", razorpayQrId: null, total: { toString: () => "100" } },
      { id: "inv-2", razorpayPaymentLinkId: "plink_B", razorpayQrId: null, total: { toString: () => "200" } },
    ]);
    mocks.fetchPaymentLink
      .mockResolvedValueOnce({ id: "plink_A", status: "paid", payments: [{ payment_id: "pay_A", amount: 10000 }] })
      .mockResolvedValueOnce({ id: "plink_B", status: "created", payments: null });
    await runPollTick();
    expect(mocks.markPaid).toHaveBeenCalledTimes(1);
    expect(mocks.markPaid).toHaveBeenCalledWith("inv-1", "pay_A", 100, "Razorpay");
  });

  it("marks expired links Expired", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "inv-1", razorpayPaymentLinkId: "plink_A", razorpayQrId: null, total: { toString: () => "100" } },
    ]);
    mocks.fetchPaymentLink.mockResolvedValueOnce({ id: "plink_A", status: "expired", payments: null });
    await runPollTick();
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentLinkStatus: "Expired" }) })
    );
    expect(mocks.markPaid).not.toHaveBeenCalled();
  });

  it("per-row failure does not break the tick", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "inv-1", razorpayPaymentLinkId: "plink_A", razorpayQrId: null, total: { toString: () => "100" } },
      { id: "inv-2", razorpayPaymentLinkId: "plink_B", razorpayQrId: null, total: { toString: () => "200" } },
    ]);
    mocks.fetchPaymentLink
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ id: "plink_B", status: "paid", payments: [{ payment_id: "pay_B", amount: 20000 }] });
    await runPollTick();
    expect(mocks.markPaid).toHaveBeenCalledWith("inv-2", "pay_B", 200, "Razorpay");
  });
});

describe("poller.pollOne", () => {
  it("polls a single invoice on demand", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "inv-1", razorpayPaymentLinkId: "plink_A", razorpayQrId: null, total: { toString: () => "100" } },
    ]);
    mocks.fetchPaymentLink.mockResolvedValueOnce({ id: "plink_A", status: "paid", payments: [{ payment_id: "pay_A", amount: 10000 }] });
    await pollOne("inv-1");
    expect(mocks.markPaid).toHaveBeenCalledWith("inv-1", "pay_A", 100, "Razorpay");
  });
});
