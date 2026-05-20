import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integration tests for the 5 payments IPC handlers.
 *
 * Pattern: vi.hoisted to capture the registered Map, then import the
 * module under test (side-effect only — handlers are registered on import).
 */

// ── Capture registered handlers before module load ─────────────────────────
const { registered } = vi.hoisted(() => {
  const registered = new Map<string, Function>();
  return { registered };
});

// ── Mock electron ──────────────────────────────────────────────────────────
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "." },
}));

// ── Mock @main/ipc (register) ──────────────────────────────────────────────
vi.mock("@main/ipc", () => ({
  register: (channel: string, handler: Function) => {
    registered.set(channel, handler);
  },
}));

// ── Prisma mock ────────────────────────────────────────────────────────────
vi.mock("@main/db", () => {
  const prismaState = {
    labSettings: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: () => prismaState, __state: prismaState };
});

// ── Crypto service mock ────────────────────────────────────────────────────
vi.mock("@main/services/crypto.service", () => ({
  decryptSecret: vi.fn((s: string) => `decrypted:${s}`),
}));

// ── Link service mock ──────────────────────────────────────────────────────
vi.mock("@main/services/payments/link.service", () => ({
  createLinkForInvoice: vi.fn(),
}));

// ── QR service mock ────────────────────────────────────────────────────────
vi.mock("@main/services/payments/qr.service", () => ({
  createQrForInvoice: vi.fn(),
  cancelQrForInvoice: vi.fn(),
}));

// ── Poller mock ────────────────────────────────────────────────────────────
vi.mock("@main/services/payments/poller", () => ({
  pollOne: vi.fn(),
  startPaymentsPoller: vi.fn(),
  stopPaymentsPoller: vi.fn(),
}));

// ── Razorpay client mock ───────────────────────────────────────────────────
const mockTestConnection = vi.fn();
vi.mock("@main/services/payments/razorpay-client", () => ({
  createRazorpayClient: vi.fn(() => ({
    testConnection: mockTestConnection,
  })),
}));

// ── Imports (after all vi.mock hoisting) ──────────────────────────────────
// Side-effect import registers all 5 handlers into `registered`.
import "../payments.ipc";
import { setSession } from "@main/session";
import * as db from "@main/db";
import * as linkService from "@main/services/payments/link.service";
import * as qrService from "@main/services/payments/qr.service";
import * as poller from "@main/services/payments/poller";

const state = (db as any).__state;
const mockCreateLink = linkService.createLinkForInvoice as ReturnType<typeof vi.fn>;
const mockCreateQr = qrService.createQrForInvoice as ReturnType<typeof vi.fn>;
const mockCancelQr = qrService.cancelQrForInvoice as ReturnType<typeof vi.fn>;
const mockPollOne = poller.pollOne as ReturnType<typeof vi.fn>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function invoke(channel: string, payload?: unknown) {
  const handler = registered.get(channel);
  if (!handler) throw new Error(`Handler not registered: ${channel}`);
  return handler(payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ id: "admin-1", username: "admin", name: "Admin User", role: "Admin" });
});

// ─────────────────────────────────────────────────────────────────────────────
// payments:createLink
// ─────────────────────────────────────────────────────────────────────────────

describe("payments:createLink", () => {
  it("calls createLinkForInvoice with invoiceId and returns result", async () => {
    const mockResult = { id: "plink_123", shortUrl: "https://rzp.io/l/abc", expiresAt: new Date() };
    mockCreateLink.mockResolvedValue(mockResult);

    const result = await invoke("payments:createLink", { invoiceId: "inv_1" });

    expect(mockCreateLink).toHaveBeenCalledWith("inv_1");
    expect(result).toBe(mockResult);
  });

  it("throws UNAUTHENTICATED when no session", async () => {
    setSession(null);
    mockCreateLink.mockResolvedValue({});

    await expect(invoke("payments:createLink", { invoiceId: "inv_1" })).rejects.toThrow("UNAUTHENTICATED");
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it("works for non-admin staff session", async () => {
    setSession({ id: "staff-1", username: "staff", name: "Staff", role: "Staff" });
    const mockResult = { id: "plink_456", shortUrl: "https://rzp.io/l/xyz", expiresAt: new Date() };
    mockCreateLink.mockResolvedValue(mockResult);

    const result = await invoke("payments:createLink", { invoiceId: "inv_2" });

    expect(result).toBe(mockResult);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// payments:createQr
// ─────────────────────────────────────────────────────────────────────────────

describe("payments:createQr", () => {
  it("calls createQrForInvoice with invoiceId and returns result", async () => {
    const mockResult = { id: "qr_123", imageUrl: "https://rzp.io/qr/img.png", expiresAt: new Date() };
    mockCreateQr.mockResolvedValue(mockResult);

    const result = await invoke("payments:createQr", { invoiceId: "inv_1" });

    expect(mockCreateQr).toHaveBeenCalledWith("inv_1");
    expect(result).toBe(mockResult);
  });

  it("throws UNAUTHENTICATED (requireSession) when no session", async () => {
    setSession(null);

    await expect(invoke("payments:createQr", { invoiceId: "inv_1" })).rejects.toThrow("UNAUTHENTICATED");
    expect(mockCreateQr).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// payments:cancelQr
// ─────────────────────────────────────────────────────────────────────────────

describe("payments:cancelQr", () => {
  it("calls cancelQrForInvoice with invoiceId", async () => {
    mockCancelQr.mockResolvedValue(undefined);

    await invoke("payments:cancelQr", { invoiceId: "inv_1" });

    expect(mockCancelQr).toHaveBeenCalledWith("inv_1");
  });

  it("throws UNAUTHENTICATED when no session", async () => {
    setSession(null);

    await expect(invoke("payments:cancelQr", { invoiceId: "inv_1" })).rejects.toThrow("UNAUTHENTICATED");
    expect(mockCancelQr).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// payments:checkNow
// ─────────────────────────────────────────────────────────────────────────────

describe("payments:checkNow", () => {
  it("calls pollOne with invoiceId", async () => {
    mockPollOne.mockResolvedValue(undefined);

    await invoke("payments:checkNow", { invoiceId: "inv_1" });

    expect(mockPollOne).toHaveBeenCalledWith("inv_1");
  });

  it("throws UNAUTHENTICATED when no session", async () => {
    setSession(null);

    await expect(invoke("payments:checkNow", { invoiceId: "inv_1" })).rejects.toThrow("UNAUTHENTICATED");
    expect(mockPollOne).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// payments:testConnection
// ─────────────────────────────────────────────────────────────────────────────

describe("payments:testConnection", () => {
  it("returns {ok: true} on successful connection", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      razorpayKeyId: "rzp_test_key",
      razorpayKeySecret: "encrypted_secret",
      razorpayMode: "Test",
    });
    mockTestConnection.mockResolvedValue(true);

    const result = await invoke("payments:testConnection");

    expect(result).toEqual({ ok: true, mode: "Test" });
    expect(mockTestConnection).toHaveBeenCalledOnce();
  });

  it("throws RAZORPAY_NOT_CONFIGURED when keyId is missing", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      razorpayKeyId: null,
      razorpayKeySecret: "encrypted_secret",
      razorpayMode: "Test",
    });

    await expect(invoke("payments:testConnection")).rejects.toThrow("RAZORPAY_NOT_CONFIGURED");
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("throws RAZORPAY_NOT_CONFIGURED when keySecret is missing", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      razorpayKeyId: "rzp_test_key",
      razorpayKeySecret: null,
      razorpayMode: "Test",
    });

    await expect(invoke("payments:testConnection")).rejects.toThrow("RAZORPAY_NOT_CONFIGURED");
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("throws RAZORPAY_NOT_CONFIGURED when settings are null", async () => {
    state.labSettings.findUnique.mockResolvedValue(null);

    await expect(invoke("payments:testConnection")).rejects.toThrow("RAZORPAY_NOT_CONFIGURED");
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("requires Admin — throws FORBIDDEN for Staff", async () => {
    setSession({ id: "staff-1", username: "staff", name: "Staff", role: "Staff" });

    await expect(invoke("payments:testConnection")).rejects.toThrow("FORBIDDEN");
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("requires Admin — throws UNAUTHENTICATED when no session", async () => {
    setSession(null);

    await expect(invoke("payments:testConnection")).rejects.toThrow("UNAUTHENTICATED");
    expect(mockTestConnection).not.toHaveBeenCalled();
  });
});
