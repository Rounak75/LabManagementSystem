export type NotificationChannel = "SMS" | "Email";

export type NotificationPurpose =
  | "ReportReady"
  | "VisitBooked"
  | "PaymentDue"
  | "HomeVisitReminder"
  | "PaymentLink";

export type NotificationStatus =
  | "Pending"
  | "Sending"
  | "Sent"
  | "Failed"
  | "WaitingForPayment";

export type SendResult =
  | { ok: true; messageId: string; payload: string }
  | { ok: false; error: string; retryable: boolean };

export interface RenderContext {
  patientName: string;       // truncated to 20 chars by render-template
  visitDate: string;         // "12 May 2026"
  visitTime?: string;
  amount?: number;           // integer rupees
  testList?: string[];       // names of tests in the visit (Email only)
  patientId: string;         // LAB-YYYY-NNNNN — used in email PDF filename
  visitId: string;
  paymentShortUrl?: string;  // Razorpay short URL for payment link (SMS only)
}

export interface RenderedMessage {
  // SMS-only
  smsBody?: string;          // human-readable representation, stored as payload
  smsVariablesString?: string; // pipe-joined for Fast2SMS variables_values
  dltTemplateId?: string;
  // Email-only
  subject?: string;
  emailText?: string;
  emailHtml?: string;
}

export interface EnqueueRow {
  visitId: string;
  patientId: string;
  channel: NotificationChannel;
  recipient: string;
  purpose: NotificationPurpose;
  status: NotificationStatus;
  scheduledFor: Date | null;
  subject: string | null;
}
