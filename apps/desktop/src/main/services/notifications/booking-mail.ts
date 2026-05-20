// Phase 3d Plan F — direct email helper for booking-lifecycle notifications.
//
// The main Notification queue requires a (visitId, patientId) pair and a PDF
// attachment via report.service. Booking events fire BEFORE a visit exists
// (BookingCreatedStaff, PortalDispute) or for patients without a Patient row
// yet (BookingDeclined), so they can't use the queue. This helper sends
// best-effort plain-text/HTML emails directly via the same SMTP config that
// the queued ReportReady sender uses.

import nodemailer from "nodemailer";
import { prisma } from "@main/db";
import { decryptSecret } from "../crypto.service";

interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendBookingMail(input: MailInput): Promise<void> {
  const settings = await prisma().labSettings.findFirst();
  if (!settings) return;
  if (!settings.notificationsEnabled || !settings.emailEnabled) return;
  if (!settings.emailSmtpUser || !settings.emailSmtpPassword) return;

  let pass: string;
  try {
    pass = decryptSecret(settings.emailSmtpPassword);
  } catch {
    console.warn("[booking-mail] SMTP password decrypt failed; skipping send.");
    return;
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
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, "<br/>"),
    });
  } catch (err) {
    console.error("[booking-mail] sendMail failed", err);
  }
}
