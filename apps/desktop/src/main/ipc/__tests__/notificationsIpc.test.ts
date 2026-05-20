import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Mock-based unit tests for the four main notifications IPC handlers:
 *   listNotifications, retryNotification, cancelNotification,
 *   sendTestSms, sendTestEmail
 *
 * Pattern matches concurrencyVersion.test.ts / visitTestsUnlock.test.ts:
 *   - vi.mock("electron") to silence ipcMain at module load
 *   - vi.mock("@main/db") with a shared __state object
 *   - vi.mock for all external service deps
 */

// electron is imported at load-time by @main/ipc (the register() module).
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "." },
}));

// ── Prisma mock ────────────────────────────────────────────────────────────
vi.mock("@main/db", () => {
  const prismaState = {
    notification: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    labSettings: {
      findFirst: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return { prisma: () => prismaState, __state: prismaState };
});

// ── Queue mock ─────────────────────────────────────────────────────────────
vi.mock("@main/services/notifications/queue", () => ({
  cancel: vi.fn(),
  failedCount: vi.fn(),
}));

// ── Test-logger sender mock ────────────────────────────────────────────────
vi.mock("@main/services/notifications/senders/test-logger", () => ({
  send: vi.fn(),
}));

// ── Crypto service mock ────────────────────────────────────────────────────
vi.mock("@main/services/crypto.service", () => ({
  decryptSecret: vi.fn((s: string) => `decrypted:${s}`),
}));

// ── Nodemailer mock ────────────────────────────────────────────────────────
const mockSendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

// ── Imports (after all vi.mock hoisting) ──────────────────────────────────
import {
  listNotifications,
  retryNotification,
  cancelNotification,
  sendTestSms,
  sendTestEmail,
} from "../notifications.ipc";
import { setSession } from "@main/session";
import * as db from "@main/db";
import * as queueModule from "@main/services/notifications/queue";
import * as testLoggerModule from "@main/services/notifications/senders/test-logger";

const state = (db as any).__state;
const mockCancel = queueModule.cancel as ReturnType<typeof vi.fn>;
const mockTestLoggerSend = testLoggerModule.send as ReturnType<typeof vi.fn>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    status: "Pending",
    channel: "SMS",
    purpose: "ReportReady",
    visitId: "v1",
    patientId: "p1",
    attempts: 0,
    cancelledAt: null,
    error: null,
    nextAttemptAt: null,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ id: "admin-1", username: "admin", name: "Admin User", role: "Admin" });
  state.auditLog.create.mockResolvedValue({});
  state.notification.update.mockResolvedValue({});
  state.notification.count.mockResolvedValue(0);
  state.notification.findMany.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// notifications:list
// ─────────────────────────────────────────────────────────────────────────────

describe("notifications:list", () => {
  it("returns rows and total with no filters", async () => {
    const rows = [makeNotification(), makeNotification({ id: "notif-2", channel: "Email" })];
    state.notification.findMany.mockResolvedValue(rows);
    state.notification.count.mockResolvedValue(2);

    const result = await listNotifications({});

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("passes status filter to prisma", async () => {
    state.notification.findMany.mockResolvedValue([]);
    state.notification.count.mockResolvedValue(0);

    await listNotifications({ status: "Failed" });

    const findManyArg = state.notification.findMany.mock.calls[0][0];
    expect(findManyArg.where.status).toBe("Failed");
  });

  it("passes channel filter to prisma", async () => {
    state.notification.findMany.mockResolvedValue([]);
    state.notification.count.mockResolvedValue(0);

    await listNotifications({ channel: "Email" });

    const findManyArg = state.notification.findMany.mock.calls[0][0];
    expect(findManyArg.where.channel).toBe("Email");
  });

  it("passes purpose filter to prisma", async () => {
    state.notification.findMany.mockResolvedValue([]);
    state.notification.count.mockResolvedValue(0);

    await listNotifications({ purpose: "PaymentDue" });

    const findManyArg = state.notification.findMany.mock.calls[0][0];
    expect(findManyArg.where.purpose).toBe("PaymentDue");
  });

  it("respects pagination: skip = (page-1)*pageSize", async () => {
    state.notification.findMany.mockResolvedValue([]);
    state.notification.count.mockResolvedValue(0);

    await listNotifications({ page: 3, pageSize: 10 });

    const findManyArg = state.notification.findMany.mock.calls[0][0];
    expect(findManyArg.skip).toBe(20);
    expect(findManyArg.take).toBe(10);
  });

  it("clamps pageSize to max 200", async () => {
    state.notification.findMany.mockResolvedValue([]);
    state.notification.count.mockResolvedValue(0);

    await listNotifications({ pageSize: 9999 });

    const findManyArg = state.notification.findMany.mock.calls[0][0];
    expect(findManyArg.take).toBe(200);
  });

  it("requires Admin role", async () => {
    setSession({ id: "s1", username: "staff", name: "Staff", role: "Staff" });
    await expect(listNotifications({})).rejects.toThrow("FORBIDDEN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// notifications:retry
// ─────────────────────────────────────────────────────────────────────────────

describe("notifications:retry", () => {
  it("throws NOT_FOUND when id does not exist", async () => {
    state.notification.findUnique.mockResolvedValue(null);

    await expect(retryNotification({ id: "missing" })).rejects.toThrow("NOT_FOUND");
    expect(state.notification.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FAILED when row status is Pending", async () => {
    state.notification.findUnique.mockResolvedValue(makeNotification({ status: "Pending" }));

    await expect(retryNotification({ id: "notif-1" })).rejects.toThrow("NOT_FAILED");
    expect(state.notification.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FAILED when row status is Sent", async () => {
    state.notification.findUnique.mockResolvedValue(makeNotification({ status: "Sent" }));

    await expect(retryNotification({ id: "notif-1" })).rejects.toThrow("NOT_FAILED");
    expect(state.notification.update).not.toHaveBeenCalled();
  });

  it("resets a Failed row to Pending with cleared fields", async () => {
    state.notification.findUnique.mockResolvedValue(
      makeNotification({ status: "Failed", attempts: 3, error: "timeout", nextAttemptAt: new Date() })
    );

    await retryNotification({ id: "notif-1" });

    const updateArg = state.notification.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "notif-1" });
    expect(updateArg.data.status).toBe("Pending");
    expect(updateArg.data.attempts).toBe(0);
    expect(updateArg.data.nextAttemptAt).toBeNull();
    expect(updateArg.data.error).toBeNull();
    expect(updateArg.data.scheduledFor).toBeInstanceOf(Date);
  });

  it("writes audit log on successful retry", async () => {
    state.notification.findUnique.mockResolvedValue(makeNotification({ status: "Failed" }));

    await retryNotification({ id: "notif-1" });

    // auditBestEffort calls audit.service which calls auditLog.create
    expect(state.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = state.auditLog.create.mock.calls[0][0];
    expect(auditArg.data.action).toBe("NOTIFICATION_RETRIED");
    expect(auditArg.data.targetEntity).toBe("Notification");
    expect(auditArg.data.targetId).toBe("notif-1");
    expect(auditArg.data.userId).toBe("admin-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// notifications:cancel
// ─────────────────────────────────────────────────────────────────────────────

describe("notifications:cancel", () => {
  it("cancels a Pending row — queue.cancel returns ok", async () => {
    mockCancel.mockResolvedValue({ ok: true });

    await cancelNotification({ id: "notif-1" });

    expect(mockCancel).toHaveBeenCalledWith("notif-1");
    expect(state.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = state.auditLog.create.mock.calls[0][0];
    expect(auditArg.data.action).toBe("NOTIFICATION_CANCELLED");
  });

  it("is idempotent — already-cancelled row still returns ok (no throw)", async () => {
    // queue.cancel returns ok: true even for already-cancelled (from queue.ts: if (row.cancelledAt) return { ok: true })
    mockCancel.mockResolvedValue({ ok: true });

    // Should not throw
    await expect(cancelNotification({ id: "notif-1" })).resolves.toBeUndefined();
  });

  it("throws ALREADY_SENT when queue.cancel returns reason=ALREADY_SENT", async () => {
    mockCancel.mockResolvedValue({ ok: false, reason: "ALREADY_SENT" });

    await expect(cancelNotification({ id: "notif-1" })).rejects.toThrow("ALREADY_SENT");
    // No audit on failure
    expect(state.auditLog.create).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when queue.cancel returns reason=NOT_FOUND", async () => {
    mockCancel.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });

    await expect(cancelNotification({ id: "missing" })).rejects.toThrow("NOT_FOUND");
  });

  it("works with a regular logged-in non-admin user (requireSession, not requireAdmin)", async () => {
    setSession({ id: "staff-1", username: "staff", name: "Staff", role: "Staff" });
    mockCancel.mockResolvedValue({ ok: true });

    // Must not throw FORBIDDEN
    await expect(cancelNotification({ id: "notif-1" })).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// notifications:sendTestSms
// ─────────────────────────────────────────────────────────────────────────────

describe("notifications:sendTestSms", () => {
  it("returns notifications_disabled when notificationsEnabled is false", async () => {
    state.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: false, smsProvider: "Test" });

    const result = await sendTestSms({ phone: "9876543210" });

    expect(result).toEqual({ ok: false, error: "notifications_disabled" });
  });

  it("returns sms_provider_off when smsProvider is Off", async () => {
    state.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: true, smsProvider: "Off" });

    const result = await sendTestSms({ phone: "9876543210" });

    expect(result).toEqual({ ok: false, error: "sms_provider_off" });
  });

  it("writes to log file and returns ok=true in Test mode", async () => {
    state.labSettings.findFirst.mockResolvedValue({ notificationsEnabled: true, smsProvider: "Test" });
    mockTestLoggerSend.mockResolvedValue({ ok: true, messageId: "test-123", payload: "Test SMS from Lab Management System" });

    const result = await sendTestSms({ phone: "9876543210" });

    expect(mockTestLoggerSend).toHaveBeenCalledOnce();
    const sendArg = mockTestLoggerSend.mock.calls[0]![0];
    expect(sendArg.channel).toBe("SMS");
    expect(sendArg.recipient).toBe("9876543210");
    expect(sendArg.purpose).toBe("ReportReady");
    expect(result).toEqual({ ok: true });
  });

  it("returns sms_misconfigured when Fast2SMS settings are missing", async () => {
    state.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      smsProvider: "Fast2SMS",
      smsApiKey: null,
      smsSenderId: null,
      smsTemplateReportReady: null,
    });

    const result = await sendTestSms({ phone: "9876543210" });

    expect(result).toEqual({ ok: false, error: "sms_misconfigured" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// notifications:sendTestEmail
// ─────────────────────────────────────────────────────────────────────────────

describe("notifications:sendTestEmail", () => {
  it("returns email_disabled when notificationsEnabled is false", async () => {
    state.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: false,
      emailEnabled: true,
      emailSmtpUser: "user@example.com",
      emailSmtpPassword: "enc:secret",
    });

    const result = await sendTestEmail({ email: "test@example.com" });

    expect(result).toEqual({ ok: false, error: "email_disabled" });
  });

  it("returns email_disabled when emailEnabled is false", async () => {
    state.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: false,
      emailSmtpUser: "user@example.com",
      emailSmtpPassword: "enc:secret",
    });

    const result = await sendTestEmail({ email: "test@example.com" });

    expect(result).toEqual({ ok: false, error: "email_disabled" });
  });

  it("returns smtp_misconfigured when emailSmtpUser is missing", async () => {
    state.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: true,
      emailSmtpUser: null,
      emailSmtpPassword: "enc:secret",
    });

    const result = await sendTestEmail({ email: "test@example.com" });

    expect(result).toEqual({ ok: false, error: "smtp_misconfigured" });
  });

  it("returns smtp_misconfigured when emailSmtpPassword is missing", async () => {
    state.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: true,
      emailSmtpUser: "user@example.com",
      emailSmtpPassword: null,
    });

    const result = await sendTestEmail({ email: "test@example.com" });

    expect(result).toEqual({ ok: false, error: "smtp_misconfigured" });
  });

  it("sends email and returns ok=true when SMTP is configured", async () => {
    state.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: true,
      emailSmtpUser: "user@example.com",
      emailSmtpPassword: "enc:mypassword",
      emailSmtpHost: "smtp.gmail.com",
      emailSmtpPort: 587,
      emailFromName: "Lab Reports",
    });
    mockSendMail.mockResolvedValue({ messageId: "smtp-123" });

    const result = await sendTestEmail({ email: "doctor@example.com" });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const mailArg = mockSendMail.mock.calls[0]![0];
    expect(mailArg.to).toBe("doctor@example.com");
    expect(mailArg.subject).toBe("Test Email — Lab Management System");
    expect(result).toEqual({ ok: true });
  });

  it("returns smtp_error when nodemailer throws", async () => {
    state.labSettings.findFirst.mockResolvedValue({
      notificationsEnabled: true,
      emailEnabled: true,
      emailSmtpUser: "user@example.com",
      emailSmtpPassword: "enc:mypassword",
      emailSmtpHost: "smtp.gmail.com",
      emailSmtpPort: 587,
      emailFromName: "Lab Reports",
    });
    mockSendMail.mockRejectedValue(new Error("Connection refused"));

    const result = await sendTestEmail({ email: "doctor@example.com" });

    expect(result).toEqual({ ok: false, error: "Connection refused" });
  });
});
