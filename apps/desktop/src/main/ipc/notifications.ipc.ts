import nodemailer from "nodemailer";
import { register } from "@main/ipc";
import { requireAdmin, requireSession } from "@main/session";
import { prisma } from "@main/db";
import { audit as auditBestEffort } from "@main/services/audit-best-effort";
import { decryptSecret } from "@main/services/crypto.service";
import * as queue from "@main/services/notifications/queue";
import { send as testLoggerSend } from "@main/services/notifications/senders/test-logger";
import { sendViaFast2Sms } from "@main/services/notifications/senders/fast2sms";

// ─── notifications:list ───────────────────────────────────────────────────

export async function listNotifications(p: {
  status?: string;
  channel?: string;
  purpose?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  visitId?: string;
}) {
  requireAdmin();

  const page     = Math.max(1, p.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, p.pageSize ?? 50));

  const where: any = {};
  if (p.status)  where.status  = p.status;
  if (p.channel) where.channel = p.channel;
  if (p.purpose) where.purpose = p.purpose;
  if (p.visitId) where.visitId = p.visitId;
  if (p.from || p.to) where.createdAt = {};
  if (p.from) where.createdAt.gte = new Date(p.from);
  if (p.to)   where.createdAt.lte = new Date(p.to);

  const [rows, total] = await Promise.all([
    prisma().notification.findMany({
      where,
      include: { patient: { select: { name: true, patientId: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma().notification.count({ where }),
  ]);

  return { rows, total };
}

register("notifications:list", listNotifications);

// ─── notifications:retry ─────────────────────────────────────────────────

export async function retryNotification({ id }: { id: string }) {
  const u = requireAdmin();

  const row = await prisma().notification.findUnique({ where: { id } });
  if (!row) throw new Error("NOT_FOUND");
  if (row.status !== "Failed") throw new Error("NOT_FAILED");

  await prisma().notification.update({
    where: { id },
    data: {
      status: "Pending",
      attempts: 0,
      nextAttemptAt: null,
      scheduledFor: new Date(),
      error: null,
    },
  });

  await auditBestEffort.try("NOTIFICATION_RETRIED", {
    entityType: "Notification",
    entityId: id,
    userId: u.id,
  });
}

register("notifications:retry", retryNotification);

// ─── notifications:cancel ────────────────────────────────────────────────

export async function cancelNotification({ id }: { id: string }) {
  const u = requireSession();

  const result = await queue.cancel(id);
  if (!result.ok) throw new Error(result.reason ?? "CANCEL_FAILED");

  await auditBestEffort.try("NOTIFICATION_CANCELLED", {
    entityType: "Notification",
    entityId: id,
    userId: u.id,
  });
}

register("notifications:cancel", cancelNotification);

// ─── notifications:sendTestSms ───────────────────────────────────────────

export async function sendTestSms({ phone }: { phone: string }) {
  requireAdmin();

  const settings = await prisma().labSettings.findFirst();
  if (!settings?.notificationsEnabled) {
    return { ok: false, error: "notifications_disabled" };
  }

  if (settings.smsProvider === "Off") {
    return { ok: false, error: "sms_provider_off" };
  }

  if (settings.smsProvider === "Test") {
    const result = await testLoggerSend({
      id: `test-sms-${Date.now()}`,
      channel: "SMS",
      recipient: phone,
      purpose: "ReportReady",
      payload: "Test SMS from Lab Management System",
    });
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error };
  }

  // Fast2SMS
  if (!settings.smsApiKey || !settings.smsSenderId || !settings.smsTemplateReportReady) {
    return { ok: false, error: "sms_misconfigured" };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.smsApiKey);
  } catch {
    return { ok: false, error: "sms_apikey_decrypt_failed" };
  }

  const result = await sendViaFast2Sms({
    apiKey,
    senderId: settings.smsSenderId,
    dltTemplateId: settings.smsTemplateReportReady,
    numbers: phone.replace(/^\+?91/, ""),
    variablesValues: "Test Patient|01 Jan 2026",
    messageId: `test-sms-${Date.now()}`,
  });

  if (result.ok) return { ok: true };
  return { ok: false, error: result.error };
}

register("notifications:sendTestSms", sendTestSms);

// ─── notifications:sendTestEmail ─────────────────────────────────────────

export async function sendTestEmail({ email }: { email: string }) {
  requireAdmin();

  const settings = await prisma().labSettings.findFirst();
  if (!settings?.notificationsEnabled || !settings.emailEnabled) {
    return { ok: false, error: "email_disabled" };
  }
  if (!settings.emailSmtpUser || !settings.emailSmtpPassword) {
    return { ok: false, error: "smtp_misconfigured" };
  }

  let pass: string;
  try {
    pass = decryptSecret(settings.emailSmtpPassword);
  } catch {
    return { ok: false, error: "smtp_password_decrypt_failed" };
  }

  const transport = nodemailer.createTransport({
    host: settings.emailSmtpHost ?? "smtp.gmail.com",
    port: settings.emailSmtpPort,
    secure: settings.emailSmtpPort === 465,
    auth: { user: settings.emailSmtpUser, pass },
  });

  try {
    await transport.sendMail({
      from: `"${settings.emailFromName}" <${settings.emailSmtpUser}>`,
      to: email,
      subject: "Test Email — Lab Management System",
      text: "This is a test email from your Lab Management System. If you received this, your email settings are working correctly.",
      html: "<p>This is a test email from your <strong>Lab Management System</strong>. If you received this, your email settings are working correctly.</p>",
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? "smtp_error" };
  }
}

register("notifications:sendTestEmail", sendTestEmail);

// ─── notifications:failedCount ───────────────────────────────────────────

register("notifications:failedCount", async () => {
  requireAdmin();
  return queue.failedCount();
});
