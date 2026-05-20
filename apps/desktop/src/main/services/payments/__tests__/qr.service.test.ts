import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const invoiceMock = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const settingsMock = {
    findUnique: vi.fn(),
  };
  const prismaMock = {
    invoice: invoiceMock,
    labSettings: settingsMock,
  };

  return {
    prismaMock,
    decryptSecret: vi.fn((s: string) => s + "_decrypted"),
    getRazorpayClient: vi.fn(),
    assertWithinDailyCap: vi.fn(),
  };
});

vi.mock("@main/db", () => ({ prisma: () => mocks.prismaMock }));
vi.mock("@main/services/crypto.service", () => ({
  decryptSecret: mocks.decryptSecret,
}));
vi.mock("../razorpay-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../razorpay-client")>();
  return {
    ...actual,
    createRazorpayClient: mocks.getRazorpayClient,
  };
});
vi.mock("../daily-cap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../daily-cap")>();
  return {
    ...actual,
    assertWithinDailyCap: mocks.assertWithinDailyCap,
  };
});

import {
  createQrForInvoice,
  cancelQrForInvoice,
} from "../qr.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const INVOICE_ID = "inv-qr-123";
const VISIT_ID = "visit-001";
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    razorpayMode: "Test",
    razorpayKeyId: "rzp_test_key",
    razorpayKeySecret: "encrypted_secret",
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    total: 500,
    paymentStatus: "Pending",
    razorpayQrId: null,
    razorpayQrImageUrl: null,
    paymentLinkExpiresAt: null,
    paymentLinkStatus: null,
    visit: {
      id: VISIT_ID,
    },
    ...overrides,
  };
}

function makeRazorpayClient(overrides: Record<string, unknown> = {}) {
  return {
    createQr: vi.fn().mockResolvedValue({
      id: "qr_new",
      imageUrl: "https://rzp.io/qr/new.png",
      closeBy: Math.floor((Date.now() + EXPIRY_MS) / 1000),
    }),
    closeQr: vi.fn().mockResolvedValue({
      id: "qr_new",
      image_url: "https://rzp.io/qr/new.png",
      close_by: Math.floor(Date.now() / 1000),
    }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertWithinDailyCap.mockResolvedValue(undefined);
});

// ─── createQrForInvoice — RAZORPAY_DISABLED ───────────────────────────────────

describe("createQrForInvoice — RAZORPAY_DISABLED", () => {
  it("throws RAZORPAY_DISABLED when mode is Off", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayMode: "Off" })
    );
    await expect(createQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("throws RAZORPAY_DISABLED when keyId is missing", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayKeyId: null })
    );
    await expect(createQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("throws RAZORPAY_DISABLED when keySecret is missing", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayKeySecret: null })
    );
    await expect(createQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("does not query the invoice if Razorpay is disabled", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayMode: "Off" })
    );
    await expect(createQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
    expect(mocks.prismaMock.invoice.findUnique).not.toHaveBeenCalled();
  });
});

// ─── createQrForInvoice — NOT_FOUND ───────────────────────────────────────────

describe("createQrForInvoice — NOT_FOUND", () => {
  it("throws NOT_FOUND when invoice does not exist", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(null);

    await expect(createQrForInvoice(INVOICE_ID)).rejects.toThrow("NOT_FOUND");
  });
});

// ─── createQrForInvoice — ALREADY_PAID ───────────────────────────────────────

describe("createQrForInvoice — ALREADY_PAID", () => {
  it("throws ALREADY_PAID when paymentStatus is Paid", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ paymentStatus: "Paid" })
    );

    await expect(createQrForInvoice(INVOICE_ID)).rejects.toThrow("ALREADY_PAID");
  });
});

// ─── createQrForInvoice — daily cap ───────────────────────────────────────────

describe("createQrForInvoice — daily cap", () => {
  it("calls assertWithinDailyCap before creating a QR code", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createQrForInvoice(INVOICE_ID);

    expect(mocks.assertWithinDailyCap).toHaveBeenCalledOnce();
  });

  it("propagates DailyCapExceededError", async () => {
    const { DailyCapExceededError } = await import("../daily-cap");

    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.assertWithinDailyCap.mockRejectedValue(new DailyCapExceededError());

    await expect(createQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "DAILY_CAP_EXCEEDED"
    );
  });
});

// ─── createQrForInvoice — happy path ──────────────────────────────────────────

describe("createQrForInvoice — happy path", () => {
  it("creates a QR code and persists it to the invoice", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    const result = await createQrForInvoice(INVOICE_ID);

    expect(result.id).toBe("qr_new");
    expect(result.imageUrl).toBe("https://rzp.io/qr/new.png");
    expect(result.expiresAt).toBeInstanceOf(Date);

    expect(mocks.prismaMock.invoice.update).toHaveBeenCalledOnce();
    const updateArgs = mocks.prismaMock.invoice.update.mock.calls[0]![0];
    expect(updateArgs.where.id).toBe(INVOICE_ID);
    expect(updateArgs.data.razorpayQrId).toBe("qr_new");
    expect(updateArgs.data.razorpayQrImageUrl).toBe(
      "https://rzp.io/qr/new.png"
    );
    expect(updateArgs.data.paymentLinkStatus).toBe("Created");
    expect(updateArgs.data.paymentLinkExpiresAt).toBeInstanceOf(Date);
  });

  it("decrypts the key secret before constructing the client", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createQrForInvoice(INVOICE_ID);

    expect(mocks.decryptSecret).toHaveBeenCalledWith("encrypted_secret");
    expect(mocks.getRazorpayClient).toHaveBeenCalledWith(
      expect.objectContaining({
        keyId: "rzp_test_key",
        keySecret: "encrypted_secret_decrypted",
      })
    );
  });

  it("calls createQr with amountPaise, description, closeByEpoch, and notes", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ total: 750 })
    );
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createQrForInvoice(INVOICE_ID);

    const createArgs = clientMock.createQr.mock.calls[0]![0];
    expect(createArgs.amountPaise).toBe(75000); // 750 rupees * 100
    expect(createArgs.description).toBe(`Visit ${VISIT_ID}`);
    expect(createArgs.notes).toEqual({ invoiceId: INVOICE_ID });
    expect(typeof createArgs.closeByEpoch).toBe("number");
  });

  it("sets closeByEpoch approximately 7 days from now", async () => {
    const before = Date.now();
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createQrForInvoice(INVOICE_ID);

    const after = Date.now();
    const createArgs = clientMock.createQr.mock.calls[0]![0];

    const expectedMinEpoch = Math.floor((before + EXPIRY_MS) / 1000);
    const expectedMaxEpoch = Math.floor((after + EXPIRY_MS) / 1000);

    expect(createArgs.closeByEpoch).toBeGreaterThanOrEqual(expectedMinEpoch);
    expect(createArgs.closeByEpoch).toBeLessThanOrEqual(expectedMaxEpoch);
  });
});

// ─── cancelQrForInvoice — RAZORPAY_DISABLED ───────────────────────────────────

describe("cancelQrForInvoice — RAZORPAY_DISABLED", () => {
  it("throws RAZORPAY_DISABLED when mode is Off", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayMode: "Off" })
    );
    await expect(cancelQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("throws RAZORPAY_DISABLED when keyId is missing", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayKeyId: null })
    );
    await expect(cancelQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("throws RAZORPAY_DISABLED when keySecret is missing", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayKeySecret: null })
    );
    await expect(cancelQrForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });
});

// ─── cancelQrForInvoice — NO_OPEN_QR ──────────────────────────────────────────

describe("cancelQrForInvoice — NO_OPEN_QR", () => {
  it("throws NO_OPEN_QR when invoice does not exist", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(null);

    await expect(cancelQrForInvoice(INVOICE_ID)).rejects.toThrow("NO_OPEN_QR");
  });

  it("throws NO_OPEN_QR when invoice has no razorpayQrId", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ razorpayQrId: null })
    );

    await expect(cancelQrForInvoice(INVOICE_ID)).rejects.toThrow("NO_OPEN_QR");
  });
});

// ─── cancelQrForInvoice — happy path ──────────────────────────────────────────

describe("cancelQrForInvoice — happy path", () => {
  it("calls closeQr with the invoice razorpayQrId", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ razorpayQrId: "qr_existing" })
    );
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await cancelQrForInvoice(INVOICE_ID);

    expect(clientMock.closeQr).toHaveBeenCalledOnce();
    expect(clientMock.closeQr).toHaveBeenCalledWith("qr_existing");
  });

  it("clears razorpayQrId and razorpayQrImageUrl and sets status Cancelled", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ razorpayQrId: "qr_existing" })
    );
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await cancelQrForInvoice(INVOICE_ID);

    expect(mocks.prismaMock.invoice.update).toHaveBeenCalledOnce();
    const updateArgs = mocks.prismaMock.invoice.update.mock.calls[0]![0];
    expect(updateArgs.where.id).toBe(INVOICE_ID);
    expect(updateArgs.data.razorpayQrId).toBeNull();
    expect(updateArgs.data.razorpayQrImageUrl).toBeNull();
    expect(updateArgs.data.paymentLinkStatus).toBe("Cancelled");
  });

  it("decrypts the key secret before constructing the client", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ razorpayQrId: "qr_existing" })
    );
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await cancelQrForInvoice(INVOICE_ID);

    expect(mocks.decryptSecret).toHaveBeenCalledWith("encrypted_secret");
    expect(mocks.getRazorpayClient).toHaveBeenCalledWith(
      expect.objectContaining({
        keyId: "rzp_test_key",
        keySecret: "encrypted_secret_decrypted",
      })
    );
  });
});
