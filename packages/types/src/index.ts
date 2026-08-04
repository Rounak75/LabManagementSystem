export type Role = "Admin" | "Staff";
export type Sex = "Male" | "Female" | "Other";
export type VisitType = "WalkIn" | "HomeCollection";
export type VisitStatus = "Open" | "Completed" | "Cancelled";
export const TEST_CATEGORIES = [
  "Clinical Biochemistry",
  "Hematology",
  "Urine Routine",
  "Stool Routine",
  "Serology",
  "Microbiology",
  "Cytology",
  "Other"
] as const;
export type TestCategory = typeof TEST_CATEGORIES[number];
export type ResultType = "Numeric" | "Qualitative";
export type VisitTestStatus =
  | "Collected"
  | "Processing"
  | "Outsourced"
  | "ResultEntered"
  | "Verified"
  | "Ready";
export type PaymentMethod = "Cash" | "Online" | "Mixed";
export type PaymentStatus = "Pending" | "Partial" | "Paid";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export * from "./abnormality";

export interface IpcOk<T> { ok: true; data: T; }
export interface IpcErr   { ok: false; error: { code: string; message: string }; }
export type IpcResult<T>  = IpcOk<T> | IpcErr;

// ─── Phase 3e admin-portal create schemas ─────────────────────────────────
import { z } from "zod";

/**
 * What a storable phone number looks like.
 *
 * Indian mobile numbers are ten digits beginning 6, 7, 8 or 9; 0–5 are landline
 * trunk prefixes and service codes that can take neither the confirmation call
 * nor an SMS. A number in that shape is always a typo — and since a patient's
 * phone is also their portal login, storing one locks the real patient out and
 * hands the record to whoever owns the number that was actually typed.
 *
 * The portal deploys separately and restates this rule in its own lib/phone.ts.
 */
export const MOBILE_RE = /^[6-9]\d{9}$/;
export const INVALID_PHONE_MESSAGE =
  "Invalid phone number — enter the 10-digit mobile number, starting with 6, 7, 8 or 9.";

export const patientCreateSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(MOBILE_RE, INVALID_PHONE_MESSAGE),
  email: z.string().email().optional().or(z.literal("")),
  age: z.number().int().min(0).max(150),
  sex: z.enum(["Male", "Female", "Other"]),
  address: z.string().max(500).optional().or(z.literal("")),
});
export type PatientCreate = z.infer<typeof patientCreateSchema>;

/** How money handed over at the counter was taken. */
export const COUNTER_PAYMENT_METHODS = ["Cash", "UPI"] as const;
export type CounterPaymentMethod = (typeof COUNTER_PAYMENT_METHODS)[number];

export const visitCreateSchema = z.object({
  patientId: z.string().min(1),
  visitDate: z.string(), // ISO date
  testIds: z.array(z.string()).min(1, "Pick at least one test"),
  notes: z.string().max(500).optional().or(z.literal("")),
  allocatedVisitId: z.string().regex(/^VIS-\d{4}-\d{5}$/),
  // What the patient paid at the counter, if anything. The visit total is priced
  // server-side from the catalogue, so this is only the amount handed over — it
  // is rejected if it exceeds the total. Absent means "paid nothing yet".
  amountPaid: z.number().min(0).optional(),
  paymentMethod: z.enum(COUNTER_PAYMENT_METHODS).optional(),
});
export type VisitCreate = z.infer<typeof visitCreateSchema>;
