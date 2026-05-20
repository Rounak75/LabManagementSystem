import { prisma } from "@main/db";
import { decryptSecret } from "../../crypto.service";
import { renderMessage } from "../render-template";
import type { SendResult } from "../types";
import { sendViaFast2Sms } from "./fast2sms";
import { send as testLoggerSend } from "./test-logger";

export async function send(row: {
  id: string;
  visitId: string;
  patientId: string;
  channel: string;
  recipient: string;
  purpose: any;
  subject: string | null;
}): Promise<SendResult> {
  const settings = await prisma().labSettings.findFirst();
  if (!settings) return { ok: false, error: "no_settings", retryable: false };
  if (!settings.notificationsEnabled) {
    return { ok: false, error: "notifications_disabled", retryable: false };
  }

  const visit = await prisma().visit.findUnique({
    where: { id: row.visitId },
    include: {
      patient: true,
      invoice: true,
      visitTests: { include: { test: true } },
    },
  });
  if (!visit) return { ok: false, error: "visit_not_found", retryable: false };

  // Schema uses `total` (Decimal), not `totalAmount`
  const paid = visit.invoice?.paymentStatus === "Paid";
  const ctx = {
    patientName: visit.patient.name,
    visitDate: formatDate(visit.visitDate),
    amount: visit.invoice?.total ? Number(visit.invoice.total) : 0,
    patientId: visit.patient.patientId,
    visitId: visit.id,
    // Include Razorpay short URL if available (set by the trigger for unpaid invoices)
    paymentShortUrl: visit.invoice?.razorpayPaymentLinkShortUrl ?? undefined,
  };

  const rendered = renderMessage(row.purpose, "SMS", ctx, {
    paid,
    dltIds: {
      smsTemplateReportReady: settings.smsTemplateReportReady,
      smsTemplateReportReadyUnpaid: settings.smsTemplateReportReadyUnpaid,
      smsTemplateReportReadyWithLink: settings.smsTemplateReportReadyWithLink,
      smsTemplateVisitBooked: settings.smsTemplateVisitBooked,
      smsTemplatePaymentDue: settings.smsTemplatePaymentDue,
      smsTemplateHomeVisitReminder: settings.smsTemplateHomeVisitReminder,
    },
  });

  if (settings.smsProvider === "Off") {
    return { ok: false, error: "sms_provider_off", retryable: false };
  }
  if (settings.smsProvider === "Test") {
    return testLoggerSend({
      id: row.id,
      channel: "SMS",
      recipient: row.recipient,
      purpose: row.purpose,
      payload: rendered.smsBody,
    });
  }
  // Fast2SMS
  if (!settings.smsApiKey || !settings.smsSenderId || !rendered.dltTemplateId) {
    return { ok: false, error: "sms_misconfigured", retryable: false };
  }
  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.smsApiKey);
  } catch {
    return { ok: false, error: "sms_apikey_decrypt_failed", retryable: false };
  }
  return sendViaFast2Sms({
    apiKey,
    senderId: settings.smsSenderId,
    dltTemplateId: rendered.dltTemplateId,
    numbers: row.recipient.replace(/^\+?91/, ""),
    variablesValues: rendered.smsVariablesString ?? "",
    messageId: row.id,
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
