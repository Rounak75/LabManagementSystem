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

export const patientCreateSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
  email: z.string().email().optional().or(z.literal("")),
  age: z.number().int().min(0).max(150),
  sex: z.enum(["Male", "Female", "Other"]),
  address: z.string().max(500).optional().or(z.literal("")),
});
export type PatientCreate = z.infer<typeof patientCreateSchema>;

export const visitCreateSchema = z.object({
  patientId: z.string().min(1),
  visitDate: z.string(), // ISO date
  testIds: z.array(z.string()).min(1, "Pick at least one test"),
  notes: z.string().max(500).optional().or(z.literal("")),
  allocatedVisitId: z.string().regex(/^VIS-\d{4}-\d{5}$/),
});
export type VisitCreate = z.infer<typeof visitCreateSchema>;
