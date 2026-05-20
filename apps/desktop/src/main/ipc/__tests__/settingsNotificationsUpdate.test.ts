import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the settings IPC handlers — notification fields + encryption.
 *
 * Pattern follows notificationsIpc.test.ts / concurrencyVersion.test.ts:
 *   - vi.mock("electron") to prevent ipcMain crash at module load
 *   - vi.mock("@main/db") with shared __state object
 *   - vi.mock("@main/services/crypto.service") to intercept encrypt/decrypt
 */

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "." },
}));

// ── Prisma mock ────────────────────────────────────────────────────────────
vi.mock("@main/db", () => {
  const prismaState = {
    labSettings: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return { prisma: () => prismaState, __state: prismaState };
});

// ── Crypto service mock ────────────────────────────────────────────────────
vi.mock("@main/services/crypto.service", () => ({
  encryptSecret: vi.fn((p: string) => `enc:${p}`),
  decryptSecret: (s: string) => s.replace(/^enc:/, ""),
}));

// ── Report service mock (imported transitively) ────────────────────────────
vi.mock("@main/services/report.service", () => ({
  migrateLogoToDataUri: vi.fn(() => "data:image/png;base64,fake"),
}));

// ── Imports (after all vi.mock calls are hoisted) ─────────────────────────
import { getSettings, updateSettings } from "../settings.ipc";
import { setSession } from "@main/session";
import * as db from "@main/db";
import * as cryptoService from "@main/services/crypto.service";

const state = (db as any).__state;
const encryptMock = cryptoService.encryptSecret as ReturnType<typeof vi.fn>;

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ id: "admin-1", username: "admin", name: "Admin User", role: "Admin" });
  state.auditLog.create.mockResolvedValue({});
  state.labSettings.update.mockResolvedValue({
    id: "singleton",
    smsApiKey: null,
    emailSmtpPassword: null,
  });
  state.labSettings.findUnique.mockResolvedValue({
    id: "singleton",
    smsApiKey: null,
    emailSmtpPassword: null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// settings:update — secret field encryption
// ─────────────────────────────────────────────────────────────────────────────

describe("settings:update — smsApiKey encryption", () => {
  it("encrypts smsApiKey when a non-empty value is provided", async () => {
    state.labSettings.update.mockResolvedValue({
      id: "singleton",
      smsApiKey: "enc:raw-key",
      emailSmtpPassword: null,
    });

    await updateSettings({ smsApiKey: "raw-key" });

    expect(encryptMock).toHaveBeenCalledWith("raw-key");
    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data.smsApiKey).toBe("enc:raw-key");
  });

  it("does NOT update smsApiKey when an empty string is passed", async () => {
    await updateSettings({ smsApiKey: "" });

    expect(encryptMock).not.toHaveBeenCalled();
    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("smsApiKey");
  });

  it("does NOT update smsApiKey when the field is absent from input", async () => {
    await updateSettings({ notificationsEnabled: true });

    expect(encryptMock).not.toHaveBeenCalled();
    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("smsApiKey");
  });
});

describe("settings:update — emailSmtpPassword encryption", () => {
  it("encrypts emailSmtpPassword when a non-empty value is provided", async () => {
    state.labSettings.update.mockResolvedValue({
      id: "singleton",
      smsApiKey: null,
      emailSmtpPassword: "enc:secret",
    });

    await updateSettings({ emailSmtpPassword: "secret" });

    expect(encryptMock).toHaveBeenCalledWith("secret");
    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data.emailSmtpPassword).toBe("enc:secret");
  });

  it("does NOT update emailSmtpPassword when an empty string is passed", async () => {
    await updateSettings({ emailSmtpPassword: "" });

    expect(encryptMock).not.toHaveBeenCalled();
    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("emailSmtpPassword");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// settings:update — plain notification fields pass-through
// ─────────────────────────────────────────────────────────────────────────────

describe("settings:update — plain notification fields", () => {
  it("passes notificationsEnabled through unchanged", async () => {
    await updateSettings({ notificationsEnabled: true });

    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data.notificationsEnabled).toBe(true);
  });

  it("passes smsProvider through unchanged", async () => {
    await updateSettings({ smsProvider: "Fast2SMS" });

    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data.smsProvider).toBe("Fast2SMS");
  });

  it("passes emailSmtpPort through unchanged", async () => {
    await updateSettings({ emailSmtpPort: 587 });

    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data.emailSmtpPort).toBe(587);
  });

  it("passes multiple plain fields in a single call", async () => {
    await updateSettings({
      notificationsEnabled: true,
      smsProvider: "Test",
      emailEnabled: false,
      emailSmtpHost: "smtp.example.com",
      emailFromName: "My Lab",
    });

    const updateArg = state.labSettings.update.mock.calls[0][0];
    expect(updateArg.data.notificationsEnabled).toBe(true);
    expect(updateArg.data.smsProvider).toBe("Test");
    expect(updateArg.data.emailEnabled).toBe(false);
    expect(updateArg.data.emailSmtpHost).toBe("smtp.example.com");
    expect(updateArg.data.emailFromName).toBe("My Lab");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// settings:update — requires Admin role
// ─────────────────────────────────────────────────────────────────────────────

describe("settings:update — access control", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    setSession({ id: "s1", username: "staff", name: "Staff", role: "Staff" });

    await expect(updateSettings({ notificationsEnabled: true })).rejects.toThrow("FORBIDDEN");
    expect(state.labSettings.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// settings:get — secret masking (sentinel)
// ─────────────────────────────────────────────────────────────────────────────

describe("settings:get — sentinel masking", () => {
  it("returns *** for smsApiKey when a value is stored", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      id: "singleton",
      smsApiKey: "enc:some-encrypted-blob",
      emailSmtpPassword: null,
    });

    const result = await getSettings();

    expect(result.smsApiKey).toBe("***");
  });

  it("returns null for smsApiKey when no value is stored", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      id: "singleton",
      smsApiKey: null,
      emailSmtpPassword: "enc:pass",
    });

    const result = await getSettings();

    expect(result.smsApiKey).toBeNull();
  });

  it("returns *** for emailSmtpPassword when a value is stored", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      id: "singleton",
      smsApiKey: null,
      emailSmtpPassword: "enc:mypassword",
    });

    const result = await getSettings();

    expect(result.emailSmtpPassword).toBe("***");
  });

  it("returns null for emailSmtpPassword when no value is stored", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      id: "singleton",
      smsApiKey: "enc:key",
      emailSmtpPassword: null,
    });

    const result = await getSettings();

    expect(result.emailSmtpPassword).toBeNull();
  });

  it("masks both secrets independently in a single response", async () => {
    state.labSettings.findUnique.mockResolvedValue({
      id: "singleton",
      labName: "Test Lab",
      smsApiKey: "enc:something",
      emailSmtpPassword: null,
    });

    const result = await getSettings();

    expect(result.smsApiKey).toBe("***");
    expect(result.emailSmtpPassword).toBeNull();
    // Other fields are passed through untouched.
    expect((result as any).labName).toBe("Test Lab");
  });

  it("throws NOT_FOUND when the singleton row is missing", async () => {
    state.labSettings.findUnique.mockResolvedValue(null);

    await expect(getSettings()).rejects.toThrow("NOT_FOUND");
  });

  it("requires an active session (any role)", async () => {
    setSession(null);

    await expect(getSettings()).rejects.toThrow("UNAUTHENTICATED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// settings:update — return value also uses sentinel masking
// ─────────────────────────────────────────────────────────────────────────────

describe("settings:update — return value masking", () => {
  it("returns *** sentinel for smsApiKey in the update response", async () => {
    state.labSettings.update.mockResolvedValue({
      id: "singleton",
      smsApiKey: "enc:raw-key",
      emailSmtpPassword: null,
    });

    const result = await updateSettings({ smsApiKey: "raw-key" });

    expect(result.smsApiKey).toBe("***");
  });

  it("returns null sentinel when the update did not set smsApiKey", async () => {
    state.labSettings.update.mockResolvedValue({
      id: "singleton",
      smsApiKey: null,
      emailSmtpPassword: null,
    });

    const result = await updateSettings({ notificationsEnabled: false });

    expect(result.smsApiKey).toBeNull();
  });
});
