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
vi.mock("../razorpay-client", () => ({
  createRazorpayClient: mocks.getRazorpayClient,
}));
vi.mock("../daily-cap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../daily-cap")>();
  return {
    ...actual,
    assertWithinDailyCap: mocks.assertWithinDailyCap,
  };
});

import { createLinkForInvoice } from "../link.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INVOICE_ID = "inv-abc-123";
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    razorpayPaymentLinkId: null,
    razorpayPaymentLinkShortUrl: null,
    paymentLinkExpiresAt: null,
    paymentLinkStatus: null,
    visit: {
      patient: {
        name: "Ravi Kumar",
        phone: "9876543210",
        email: null,
      },
    },
    ...overrides,
  };
}

function makeRazorpayClient(overrides: Record<string, unknown> = {}) {
  return {
    createPaymentLink: vi.fn().mockResolvedValue({
      id: "plink_new",
      shortUrl: "https://rzp.io/l/new",
      expireBy: Math.floor((Date.now() + EXPIRY_MS) / 1000),
    }),
    findPaymentLinkByReference: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertWithinDailyCap.mockResolvedValue(undefined);
});

// ─── RAZORPAY_DISABLED ────────────────────────────────────────────────────────

describe("createLinkForInvoice — RAZORPAY_DISABLED", () => {
  it("throws RAZORPAY_DISABLED when mode is Off", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayMode: "Off" })
    );
    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("throws RAZORPAY_DISABLED when keyId is missing", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayKeyId: null })
    );
    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("throws RAZORPAY_DISABLED when keySecret is missing", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayKeySecret: null })
    );
    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
  });

  it("does not query the invoice if Razorpay is disabled", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(
      makeSettings({ razorpayMode: "Off" })
    );
    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow(
      "RAZORPAY_DISABLED"
    );
    expect(mocks.prismaMock.invoice.findUnique).not.toHaveBeenCalled();
  });
});

// ─── NOT_FOUND ────────────────────────────────────────────────────────────────

describe("createLinkForInvoice — NOT_FOUND", () => {
  it("throws NOT_FOUND when invoice does not exist", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(null);

    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow("NOT_FOUND");
  });
});

// ─── ALREADY_PAID ─────────────────────────────────────────────────────────────

describe("createLinkForInvoice — ALREADY_PAID", () => {
  it("throws ALREADY_PAID when paymentStatus is Paid", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ paymentStatus: "Paid" })
    );

    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow(
      "ALREADY_PAID"
    );
  });
});

// ─── PATIENT_PHONE_MISSING ────────────────────────────────────────────────────

describe("createLinkForInvoice — PATIENT_PHONE_MISSING", () => {
  it("throws PATIENT_PHONE_MISSING when patient has no phone", async () => {
    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({
        visit: { patient: { name: "Ravi Kumar", phone: null, email: null } },
      })
    );

    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow(
      "PATIENT_PHONE_MISSING"
    );
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe("createLinkForInvoice — idempotency", () => {
  it("returns existing link without creating a new one if existing link has status 'created'", async () => {
    const existingExpiry = Math.floor((Date.now() + EXPIRY_MS) / 1000);
    const existingLink = {
      id: "plink_existing",
      short_url: "https://rzp.io/l/existing",
      expire_by: existingExpiry,
      status: "created",
    };

    const clientMock = makeRazorpayClient({
      findPaymentLinkByReference: vi.fn().mockResolvedValue(existingLink),
    });
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    const result = await createLinkForInvoice(INVOICE_ID);

    expect(clientMock.createPaymentLink).not.toHaveBeenCalled();
    expect(result.id).toBe("plink_existing");
    expect(result.shortUrl).toBe("https://rzp.io/l/existing");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("creates a new link if existing link has status 'paid' (not idempotent)", async () => {
    const existingLink = {
      id: "plink_paid",
      short_url: "https://rzp.io/l/paid",
      expire_by: Math.floor(Date.now() / 1000) + 100,
      status: "paid",
    };

    const clientMock = makeRazorpayClient({
      findPaymentLinkByReference: vi.fn().mockResolvedValue(existingLink),
    });
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    const result = await createLinkForInvoice(INVOICE_ID);

    expect(clientMock.createPaymentLink).toHaveBeenCalledOnce();
    expect(result.id).toBe("plink_new");
  });

  it("creates a new link if no existing link is found", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    const result = await createLinkForInvoice(INVOICE_ID);

    expect(clientMock.createPaymentLink).toHaveBeenCalledOnce();
    expect(result.id).toBe("plink_new");
  });
});

// ─── Daily cap ────────────────────────────────────────────────────────────────

describe("createLinkForInvoice — daily cap", () => {
  it("calls assertWithinDailyCap before creating a link", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createLinkForInvoice(INVOICE_ID);

    expect(mocks.assertWithinDailyCap).toHaveBeenCalledOnce();
  });

  it("does not call assertWithinDailyCap on idempotent return of existing 'created' link", async () => {
    const existingLink = {
      id: "plink_existing",
      short_url: "https://rzp.io/l/existing",
      expire_by: Math.floor((Date.now() + EXPIRY_MS) / 1000),
      status: "created",
    };

    const clientMock = makeRazorpayClient({
      findPaymentLinkByReference: vi.fn().mockResolvedValue(existingLink),
    });
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createLinkForInvoice(INVOICE_ID);

    expect(mocks.assertWithinDailyCap).not.toHaveBeenCalled();
  });

  it("propagates DailyCapExceededError", async () => {
    const { DailyCapExceededError } = await import("../daily-cap");

    const clientMock = makeRazorpayClient({
      findPaymentLinkByReference: vi.fn().mockResolvedValue(null),
    });
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.assertWithinDailyCap.mockRejectedValue(new DailyCapExceededError());

    await expect(createLinkForInvoice(INVOICE_ID)).rejects.toThrow(
      "DAILY_CAP_EXCEEDED"
    );
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("createLinkForInvoice — happy path", () => {
  it("creates a link and persists it to the invoice", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    const result = await createLinkForInvoice(INVOICE_ID);

    expect(result.id).toBe("plink_new");
    expect(result.shortUrl).toBe("https://rzp.io/l/new");
    expect(result.expiresAt).toBeInstanceOf(Date);

    expect(mocks.prismaMock.invoice.update).toHaveBeenCalledOnce();
    const updateArgs = mocks.prismaMock.invoice.update.mock.calls[0]![0];
    expect(updateArgs.where.id).toBe(INVOICE_ID);
    expect(updateArgs.data.razorpayPaymentLinkId).toBe("plink_new");
    expect(updateArgs.data.razorpayPaymentLinkShortUrl).toBe(
      "https://rzp.io/l/new"
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

    await createLinkForInvoice(INVOICE_ID);

    expect(mocks.decryptSecret).toHaveBeenCalledWith("encrypted_secret");
    expect(mocks.getRazorpayClient).toHaveBeenCalledWith(
      expect.objectContaining({
        keyId: "rzp_test_key",
        keySecret: "encrypted_secret_decrypted",
      })
    );
  });

  it("passes invoice total as amountRupees and referenceId as invoice id", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({ total: 750 })
    );
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createLinkForInvoice(INVOICE_ID);

    const createArgs = clientMock.createPaymentLink.mock.calls[0]![0];
    expect(createArgs.amountRupees).toBe(750);
    expect(createArgs.referenceId).toBe(INVOICE_ID);
    expect(createArgs.currency).toBe("INR");
  });

  it("passes patient name and phone to customer", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createLinkForInvoice(INVOICE_ID);

    const createArgs = clientMock.createPaymentLink.mock.calls[0]![0];
    expect(createArgs.customer.name).toBe("Ravi Kumar");
    expect(createArgs.customer.contact).toBe("9876543210");
  });

  it("passes patient email when available", async () => {
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(
      makeInvoice({
        visit: {
          patient: {
            name: "Priya",
            phone: "9999999999",
            email: "priya@example.com",
          },
        },
      })
    );
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createLinkForInvoice(INVOICE_ID);

    const createArgs = clientMock.createPaymentLink.mock.calls[0]![0];
    expect(createArgs.customer.email).toBe("priya@example.com");
  });

  it("sets expiry approximately 7 days from now", async () => {
    const before = Date.now();
    const clientMock = makeRazorpayClient();
    mocks.getRazorpayClient.mockReturnValue(clientMock);

    mocks.prismaMock.labSettings.findUnique.mockResolvedValue(makeSettings());
    mocks.prismaMock.invoice.findUnique.mockResolvedValue(makeInvoice());
    mocks.prismaMock.invoice.update.mockResolvedValue({});

    await createLinkForInvoice(INVOICE_ID);

    const createArgs = clientMock.createPaymentLink.mock.calls[0]![0];
    const after = Date.now();

    const expectedMinEpoch = Math.floor((before + EXPIRY_MS) / 1000);
    const expectedMaxEpoch = Math.floor((after + EXPIRY_MS) / 1000);

    expect(createArgs.expireByEpoch).toBeGreaterThanOrEqual(expectedMinEpoch);
    expect(createArgs.expireByEpoch).toBeLessThanOrEqual(expectedMaxEpoch);
  });
});
