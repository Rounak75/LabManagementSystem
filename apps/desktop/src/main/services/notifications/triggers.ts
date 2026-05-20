import { prisma } from "@main/db";
import { createLinkForInvoice } from "@main/services/payments/link.service";
import * as queue from "./queue";
import { sendBookingMail } from "./booking-mail";
import type { EnqueueRow } from "./types";

const LAB_PHONE = "6202924306";

function formatBookingDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const UNDO_WINDOW_MS = 60_000;

async function settings() {
  return prisma().labSettings.findFirst();
}

async function fetchVisit(visitId: string) {
  return prisma().visit.findUnique({
    where: { id: visitId },
    include: { patient: true, invoice: true },
  });
}

/** Last test of a visit was verified-and-locked. */
export async function reportReady(visitId: string): Promise<string[]> {
  const s = await settings();
  if (!s?.notificationsEnabled) return [];
  const visit = await fetchVisit(visitId);
  if (!visit?.patient?.phone) return [];

  const paid = visit.invoice?.paymentStatus === "Paid";
  const ids: string[] = [];
  const scheduled = new Date(Date.now() + UNDO_WINDOW_MS);

  // When unpaid and Razorpay is enabled, attempt to create a payment link.
  // The short URL is stored on the invoice for the SMS sender to pick up at
  // send time. Failures are non-fatal — the existing unpaid template is used.
  if (!paid && visit.invoice?.id && s.razorpayMode !== "Off") {
    try {
      await createLinkForInvoice(visit.invoice.id);
    } catch (e) {
      console.error(
        "[trigger.reportReady] payment link creation failed, falling back to no-link template",
        e,
      );
    }
  }

  ids.push(
    await queue.enqueue({
      visitId,
      patientId: visit.patientId,
      channel: "SMS",
      recipient: visit.patient.phone,
      purpose: "ReportReady",
      status: "Pending",
      scheduledFor: scheduled,
      subject: null,
    } as EnqueueRow),
  );

  if (s.emailEnabled && visit.patient.email) {
    ids.push(
      await queue.enqueue({
        visitId,
        patientId: visit.patientId,
        channel: "Email",
        recipient: visit.patient.email,
        purpose: "ReportReady",
        status: paid ? "Pending" : "WaitingForPayment",
        scheduledFor: paid ? scheduled : null,
        subject: null,
      } as EnqueueRow),
    );
  }
  return ids;
}

/** Visit just created. */
export async function visitBooked(visitId: string): Promise<string[]> {
  const s = await settings();
  if (!s?.notificationsEnabled) return [];
  const visit = await fetchVisit(visitId);
  if (!visit?.patient?.phone) return [];
  const id = await queue.enqueue({
    visitId,
    patientId: visit.patientId,
    channel: "SMS",
    recipient: visit.patient.phone,
    purpose: "VisitBooked",
    status: "Pending",
    scheduledFor: new Date(Date.now() + UNDO_WINDOW_MS),
    subject: null,
  } as EnqueueRow);
  return [id];
}

/** Invoice just marked Paid — release any WaitingForPayment email rows. */
export async function paymentReceived(invoiceId: string): Promise<number> {
  const inv = await prisma().invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return 0;
  return queue.releaseWaitingForPayment(inv.visitId);
}

// ─── Phase 3d Plan F — booking-lifecycle triggers ───────────────────────────
// These bypass the queued Notification table because they fire either before
// a Visit/Patient exists (staff alerts, declines for not-yet-created patients)
// or as one-off transactional messages. They go through `sendBookingMail`,
// which uses the same SMTP config as the queued ReportReady email sender.

/** A new Pending booking just landed in the cloud → desktop sync.
 *  Alert the staff inbox (LabSettings.labEmail) so they call to confirm. */
export async function bookingCreatedStaff(bookingId: string): Promise<void> {
  const b = await prisma().booking.findUnique({ where: { id: bookingId } });
  if (!b) return;
  const s = await settings();
  if (!s?.labEmail) return;

  const when = `${formatBookingDate(b.preferredDate)} (${b.preferredSlot})`;
  const subject = `New home-visit booking: ${b.patientName}`;
  const text =
    `New home-visit booking from ${b.patientName} (${b.patientPhone}).\n` +
    `When: ${when}\n` +
    `Address: ${b.address}${b.pincode ? ` · ${b.pincode}` : ""}\n` +
    (b.notes ? `Notes: ${b.notes}\n` : "") +
    `\nOpen the Bookings page in the desktop app to approve or decline.\n`;
  const html =
    `<p><b>${b.patientName}</b> (${b.patientPhone}) requested a home visit.</p>` +
    `<p><b>When:</b> ${when}<br/>` +
    `<b>Address:</b> ${b.address}${b.pincode ? ` · ${b.pincode}` : ""}</p>` +
    (b.notes ? `<p><b>Notes:</b> ${b.notes}</p>` : "") +
    `<p>Open the <b>Bookings</b> page in the desktop app to approve or decline.</p>`;
  await sendBookingMail({ to: s.labEmail, subject, text, html });
}

/** Staff approved the booking. Send the patient a friendly confirmation
 *  email if they provided one. */
export async function bookingApproved(bookingId: string): Promise<void> {
  const b = await prisma().booking.findUnique({ where: { id: bookingId } });
  if (!b || !b.patientEmail) return;

  const when = `${formatBookingDate(b.preferredDate)} (${b.preferredSlot})`;
  const subject = `Your home-visit booking is confirmed (${b.bookingId})`;
  const text =
    `Dear ${b.patientName},\n\n` +
    `Your home sample collection is confirmed for ${when}.\n` +
    `Our phlebotomist will visit at the scheduled time.\n\n` +
    `If you need to reschedule, call ${LAB_PHONE}.\n\n` +
    `— Golmuri Janch Ghar\n`;
  const html =
    `<p>Dear ${b.patientName},</p>` +
    `<p>Your home sample collection is confirmed for <b>${when}</b>. Our phlebotomist will visit at the scheduled time.</p>` +
    `<p>If you need to reschedule, call <a href="tel:${LAB_PHONE}">${LAB_PHONE}</a>.</p>` +
    `<p>— Golmuri Janch Ghar</p>`;
  await sendBookingMail({ to: b.patientEmail, subject, text, html });
}

/** Staff declined the booking. Email the patient with the reason. */
export async function bookingDeclined(bookingId: string): Promise<void> {
  const b = await prisma().booking.findUnique({ where: { id: bookingId } });
  if (!b || !b.patientEmail) return;

  const when = formatBookingDate(b.preferredDate);
  const subject = `Home-visit booking ${b.bookingId} declined`;
  const text =
    `Dear ${b.patientName},\n\n` +
    `Unfortunately we couldn't fulfil your home-visit booking for ${when}.\n` +
    (b.declineReason ? `Reason: ${b.declineReason}\n\n` : "\n") +
    `Please call ${LAB_PHONE} to discuss alternatives.\n\n` +
    `— Golmuri Janch Ghar\n`;
  const html =
    `<p>Dear ${b.patientName},</p>` +
    `<p>Unfortunately we couldn't fulfil your home-visit booking for <b>${when}</b>.</p>` +
    (b.declineReason ? `<p><b>Reason:</b> ${b.declineReason}</p>` : "") +
    `<p>Please call <a href="tel:${LAB_PHONE}">${LAB_PHONE}</a> to discuss alternatives.</p>` +
    `<p>— Golmuri Janch Ghar</p>`;
  await sendBookingMail({ to: b.patientEmail, subject, text, html });
}

/** A patient filed a "this isn't me" dispute from the portal. */
export async function portalDispute(disputeId: string): Promise<void> {
  const d = await prisma().dispute.findUnique({
    where: { id: disputeId },
    include: { patient: true },
  });
  if (!d) return;
  const s = await settings();
  if (!s?.labEmail) return;

  const subject = `Portal dispute filed: ${d.patient.name}`;
  const text =
    `A patient filed a dispute on the portal:\n\n` +
    `Patient: ${d.patient.name} (${d.patient.patientId})\n` +
    `Phone:   ${d.patient.phone ?? "—"}\n` +
    `Reason:  ${d.reason}\n\n` +
    `Verify by phone, then use Patient → Dissociate phone in the desktop app.\n`;
  await sendBookingMail({ to: s.labEmail, subject, text });
}

/** Daily scan: enqueue T-12h email reminders for approved home-visit
 *  bookings whose preferredDate is tomorrow. */
export async function homeVisitReminderScan(): Promise<number> {
  const s = await settings();
  if (!s?.notificationsEnabled) return 0;

  const now = new Date();
  const startOfTomorrow = new Date(now);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(0, 0, 0, 0);
  const endOfTomorrow = new Date(startOfTomorrow);
  endOfTomorrow.setHours(23, 59, 59, 999);

  const bookings = await prisma().booking.findMany({
    where: {
      status: "Approved",
      preferredDate: { gte: startOfTomorrow, lte: endOfTomorrow },
      resultingVisitId: { not: null },
      resultingPatientId: { not: null },
    },
  });

  let n = 0;
  for (const b of bookings) {
    if (!b.resultingVisitId || !b.resultingPatientId) continue;
    if (!b.patientEmail) continue; // SMS reminders are deferred until DLT clears
    const existing = await prisma().notification.findFirst({
      where: { visitId: b.resultingVisitId, purpose: "HomeVisitReminder" },
    });
    if (existing) continue;

    const slotStartHour = ({ Morning: 8, Afternoon: 12, Evening: 16 } as Record<string, number>)[b.preferredSlot] ?? 8;
    const slotStart = new Date(b.preferredDate);
    slotStart.setHours(slotStartHour, 0, 0, 0);
    const reminderTime = new Date(slotStart.getTime() - 12 * 60 * 60_000);

    await queue.enqueue({
      visitId: b.resultingVisitId,
      patientId: b.resultingPatientId,
      channel: "Email",
      recipient: b.patientEmail,
      purpose: "HomeVisitReminder",
      status: "Pending",
      scheduledFor: reminderTime,
      subject: null,
    } as EnqueueRow);
    n++;
  }
  return n;
}

/** Daily 08:00 scan: enqueue PaymentDue SMS for visits unpaid ≥3 days. */
export async function paymentDueScan(): Promise<number> {
  const s = await settings();
  if (!s?.notificationsEnabled) return 0;
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60_000);
  const visits = await prisma().visit.findMany({
    where: {
      status: "Completed",
      visitDate: { lte: cutoff },
      deletedAt: null,
      invoice: { paymentStatus: { in: ["Pending", "Partial"] } },
      notifications: { none: { purpose: "PaymentDue" } },
    },
    include: { patient: true, invoice: true },
  });
  let n = 0;
  for (const v of visits) {
    if (!v.patient?.phone) continue;
    await queue.enqueue({
      visitId: v.id,
      patientId: v.patientId,
      channel: "SMS",
      recipient: v.patient.phone,
      purpose: "PaymentDue",
      status: "Pending",
      scheduledFor: new Date(),
      subject: null,
    } as EnqueueRow);
    n++;
  }
  return n;
}
