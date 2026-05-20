import nodemailer from "nodemailer";
import { prisma } from "@main/db";
import { decryptSecret } from "../../crypto.service";
import { buildReportData } from "../../report.service";
import { renderReportPdf } from "../../pdf.service";
import { renderMessage } from "../render-template";
import type { SendResult } from "../types";
import type { TemplateConfig } from "@shared/template-config";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * A minimal default TemplateConfig used when generating the PDF for email
 * attachments. This avoids a separate DB lookup for the report template;
 * the email attachment just needs a clean, readable PDF.
 */
const DEFAULT_EMAIL_TEMPLATE: TemplateConfig = {
  headerText: "Golmuri Janch Ghar",
  footerText: "Thank you for choosing Golmuri Janch Ghar",
  signatureLine: "Authorized Signatory",
  fontFamily: "Inter",
  fontSize: 11,
  accentColor: "#0066cc",
  layout: "default",
  sections: {
    logo: false,
    doctorInfo: true,
    parametersTable: true,
    abnormalLegend: true,
    disclaimer: true,
  },
  columns: {
    testName: true,
    result: true,
    unit: true,
    referenceRange: true,
    flag: true,
    comments: false,
  },
};

/**
 * Build the PDF buffer for a visit by running the same pipeline as the
 * reports IPC handler: buildReportData → renderReportPdf.
 *
 * Keeping this as a separate named helper makes it easy to mock in tests
 * by mocking `../../report.service` (buildReportData) and
 * `../../pdf.service` (renderReportPdf) independently.
 */
async function generatePdfBuffer(visitId: string): Promise<Buffer> {
  const data = await buildReportData(visitId);
  return renderReportPdf(data, DEFAULT_EMAIL_TEMPLATE);
}

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
  if (!settings.notificationsEnabled || !settings.emailEnabled) {
    return { ok: false, error: "email_disabled", retryable: false };
  }
  if (!settings.emailSmtpUser || !settings.emailSmtpPassword) {
    return { ok: false, error: "smtp_misconfigured", retryable: false };
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

  const ctx = {
    patientName: visit.patient.name,
    visitDate: visit.visitDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    amount: visit.invoice ? Number(visit.invoice.total) : 0,
    patientId: visit.patient.patientId,
    visitId: visit.id,
    testList: visit.visitTests.map((vt: any) => vt.test.name),
  };

  const rendered = renderMessage(row.purpose, "Email", ctx, {
    paid: visit.invoice?.paymentStatus === "Paid",
    dltIds: {},
  });

  // Only ReportReady emails attach the full PDF; reminder / lifecycle emails
  // are plain-text/HTML so the patient doesn't get a duplicate report.
  let pdf: Buffer | null = null;
  if (row.purpose === "ReportReady") {
    try {
      pdf = await generatePdfBuffer(visit.id);
    } catch (err: any) {
      return { ok: false, error: `pdf_failed: ${err.message}`, retryable: false };
    }
    if (pdf.length > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "pdf_too_large", retryable: false };
    }
  }

  let pass: string;
  try {
    pass = decryptSecret(settings.emailSmtpPassword);
  } catch {
    return { ok: false, error: "smtp_password_decrypt_failed", retryable: false };
  }

  const transport = nodemailer.createTransport({
    host: settings.emailSmtpHost ?? "smtp.gmail.com",
    port: settings.emailSmtpPort,
    secure: settings.emailSmtpPort === 465,
    auth: { user: settings.emailSmtpUser, pass },
  });

  try {
    const info = await transport.sendMail({
      from: `"${settings.emailFromName}" <${settings.emailSmtpUser}>`,
      to: row.recipient,
      subject: rendered.subject ?? "Your lab report",
      text: rendered.emailText ?? "",
      html: rendered.emailHtml ?? "",
      attachments: pdf
        ? [{ filename: `${visit.patient.patientId}-${visit.id}.pdf`, content: pdf }]
        : undefined,
    });
    return {
      ok: true,
      messageId: info.messageId ?? `gmail-${Date.now()}`,
      payload: rendered.emailText ?? "",
    };
  } catch (err: any) {
    const code = err.responseCode ?? 0;
    // 5xx = permanent SMTP errors (auth failure 535 included) — non-retryable
    // 421 / 451 = temporary deferrals — retryable
    // 0 = network / unknown error — retryable
    const retryable =
      code === 0 || code === 421 || code === 451;
    return {
      ok: false,
      error: err.message ?? "smtp_error",
      retryable,
    };
  }
}
