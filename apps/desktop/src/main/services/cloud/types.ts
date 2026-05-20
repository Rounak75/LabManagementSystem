// Cloud sync shared types

export type OutboxOperation = "create" | "update" | "delete";
export type OutboxStatus = "Pending" | "Sent" | "Failed" | "Cancelled";

export interface OutboxEnqueueInput {
  tableName: string;
  operation: OutboxOperation;
  rowId: string;
  payload: unknown; // JSON.stringify'd before storage
}

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  anonKey: string;
}

export interface ClassifiedSupabaseError {
  retryable: boolean;
  userMessage: string;
  raw?: unknown;
}

export interface PaymentEventRow {
  event_id: string;
  event: string;
  razorpay_payload: {
    payload?: {
      payment_link?: { entity?: { reference_id?: string } };
      payment?: { entity?: { id?: string; amount?: number; notes?: Record<string, string> } };
    };
  };
  received_at: string;
  processed_at: string | null;
}

export interface FreeTierStatusRow {
  db_size_bytes: number;
  db_size_pretty: string;
  auth_users: number;
  recorded_at: string;
}

// The set of Prisma model names whose writes should be mirrored to the outbox.
// Camel-case names matching what Prisma's $extends `model` param passes.
// Phase 3d Plan A: added PatientAccount, Booking, PaymentClaim, Dispute.
// Phase 3d Plan H: added LabClosure (drives the portal blackout-date list).
// Phase 3e Plan A: fixed "Parameter"/"Result" → "TestParameter"/"TestResult"
// (the actual Prisma model names); added User, IdReservation, PrintJob.
// NOT included: ClientError (admin-portal writes direct to cloud; no mirror),
// CloudHeartbeat (separate push path in heartbeat.ts) and
// PrinterCalibration (local-only, per-machine printer offsets).
export const SYNCED_MODELS: ReadonlySet<string> = new Set([
  "User",
  "Patient",
  "Visit",
  "VisitTest",
  "TestResult",
  "Invoice",
  "Payment",
  "Doctor",
  "Test",
  "TestParameter",
  "LabSettings",
  "HomeVisit",
  "PatientAccount",
  "Booking",
  "PaymentClaim",
  "Dispute",
  "LabClosure",
  "IdReservation",
  "PrintJob",
]);

// Maps Prisma model name → Supabase snake_case table name
export const MODEL_TO_TABLE: Readonly<Record<string, string>> = {
  User: "users",
  Patient: "patients",
  Visit: "visits",
  VisitTest: "visit_tests",
  TestResult: "results",
  Invoice: "invoices",
  Payment: "payments",
  Doctor: "doctors",
  Test: "tests",
  TestParameter: "parameters",
  LabSettings: "lab_settings",
  HomeVisit: "home_visits",
  PatientAccount: "patient_accounts",
  Booking: "bookings",
  PaymentClaim: "payment_claims",
  Dispute: "disputes",
  LabClosure: "lab_closures",
  IdReservation: "id_reservations",
  PrintJob: "print_jobs",
};
