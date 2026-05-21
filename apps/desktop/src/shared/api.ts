import type { SessionUser, IpcResult, Role, Sex, VisitType, VisitTestStatus } from "@lab/types";
import type { TemplateConfig } from "@shared/template-config";

export type Channel =
  // auth + session
  | "auth:firstRunNeeded" | "auth:firstRunComplete"
  | "auth:login" | "auth:logout" | "auth:currentUser"
  | "auth:recoverPassword"
  // settings
  | "settings:get" | "settings:update"
  | "settings:uploadLogo" | "settings:removeLogo"
  // doctors
  | "doctors:list" | "doctors:create" | "doctors:update" | "doctors:remove"
  // tests
  | "tests:list" | "tests:get" | "tests:create" | "tests:update" | "tests:remove"
  | "params:create" | "params:update" | "params:remove"
  // patients
  | "patients:create" | "patients:get" | "patients:search" | "patients:history" | "patients:update"
  // visits
  | "visits:create" | "visits:get" | "visits:listForPatient"
  | "visits:regenerateAccessCode"
  | "visitTests:getOne" | "visitTests:updateStatus" | "visitTests:lock"
  | "visitTests:unlock"
  // outsourced
  | "outsourced:list" | "outsourced:markReceived"
  // results
  | "results:upsert" | "results:listForVisit"
  // invoices
  | "invoices:get" | "invoices:applyDiscount" | "invoices:recordCash" | "invoices:recordUpi"
  // reports
  | "reports:listReady" | "reports:generatePdf" | "reports:print"
  // staff (admin only)
  | "staff:list" | "staff:create" | "staff:setActive" | "staff:resetPassword"
  // users (admin only)
  | "users:list" | "users:create" | "users:resetPassword"
  | "users:setActive" | "users:updateRole" | "users:delete"
  | "users:setCanCollectSamples"
  // search
  | "search:global"
  // audit
  | "audit:write"
  | "audit:list" | "audit:distinctActions"
  // app utilities
  | "app:saveTextFile" | "app:pickDirectory" | "app:pickFile" | "app:logError"
  | "app:getVersion" | "updater:quitAndInstall" | "updater:checkNow"
  // backup
  | "backup:runNow" | "backup:list" | "backup:restore"
  // dashboard
  | "dashboard:stats"
  | "dashboard:paymentLinksStats"
  // templates (admin only)
  | "templates:list" | "templates:save" | "templates:setDefault"
  | "templates:duplicate" | "templates:delete"
  // notifications (admin only, except cancel)
  | "notifications:list" | "notifications:retry" | "notifications:cancel"
  | "notifications:sendTestSms" | "notifications:sendTestEmail"
  | "notifications:failedCount"
  // payments
  | "payments:createLink" | "payments:createQr" | "payments:cancelQr"
  | "payments:checkNow" | "payments:testConnection"
  // cloud sync (admin only, except getStatus which any session can read)
  | "cloud:getStatus" | "cloud:testConnection"
  | "cloud:listOutbox" | "cloud:retryOutbox" | "cloud:cancelOutbox"
  | "cloud:runBackfillNow" | "cloud:checkNow"
  // Phase 3d Plan B — printer calibration (admin only)
  | "printerCalibration:list" | "printerCalibration:upsert"
  | "printerCalibration:listSystemPrinters"
  | "print:alignmentTest"
  // Phase 3d Plan C — patient dispute (admin only)
  | "patient:dissociatePhone"
  // Phase 3d Plan F — bookings inbox (admin)
  | "bookings:list" | "bookings:approve" | "bookings:decline" | "bookings:assign"
  | "bookings:listPhlebotomists"
  // Phase 3d Plan H — lab closures (admin)
  | "closures:list" | "closures:upsert" | "closures:remove";

export interface FirstRunInput {
  admin:    { name: string; username: string; password: string };
  settings: { labName: string; labAddress: string; labPhone: string;
              morningOpenTime: string; morningCloseTime: string;
              eveningOpenTime?: string; eveningCloseTime?: string;
              childAgeBoundary: number;
              pathologistName?: string; pathologistQuals?: string };
}

export interface LoginInput { username: string; password: string; }

export interface RecoverPasswordInput {
  username: string;
  recoveryCode: string;
  newPassword: string;
}

export interface RecoverPasswordResult {
  newRecoveryCode: string;
}

export interface FirstRunCompleteResult {
  user: SessionUser;
  recoveryCode: string;
}

export interface SaveTextFileInput {
  filename: string;
  contents: string;
}

export interface SaveTextFileResult {
  saved: boolean;
  path?: string;
}

export interface LogErrorInput { scope: string; message: string; stack?: string; }

export interface PickFileInput {
  filters?: { name: string; extensions: string[] }[];
}

export interface UploadLogoInput { sourcePath: string; }
export interface UploadLogoResult { path: string; }
export interface RemoveLogoResult { ok: true; }

export interface PatientCreateInput {
  name: string; age: number; sex: Sex; phone: string;
  address?: string; referredById?: string | null;
  email?: string | null;
  /** Phase 3d: bypass the soft duplicate-phone warning (household sharing). */
  allowDuplicatePhone?: boolean;
}

export interface VisitTestCreateInput {
  testId: string;
  outsourcedSentTo?: string | null;
  outsourcedExternalRef?: string | null;
}

export interface VisitCreateInput {
  patientId: string; type: VisitType; testIds: string[]; visitDate?: string;
  /** Optional per-test metadata. Outsourced fields applied only when Test.isOutsourced is true server-side. */
  tests?: VisitTestCreateInput[];
}

export interface OutsourcedMarkReceivedInput { visitTestId: string; }
export interface OutsourcedMarkReceivedResult { ok: true; }

/** Task 10 — Admin "Unlock to edit" on a verified VisitTest. */
export interface VisitTestUnlockInput { visitTestId: string; reason: string; }
export interface VisitTestUnlockResult { isLocked: false; }

export interface OutsourcedRow {
  id: string;
  visitId: string;
  testId: string;
  outsourcedSentTo: string | null;
  outsourcedExternalRef: string | null;
  outsourcedStatus: string | null;
  outsourcedSentAt: string | Date | null;
  outsourcedReceivedAt: string | Date | null;
  visit: {
    id: string;
    visitId: string;
    patient: { id: string; patientId: string; name: string; age: number; sex: Sex };
  };
  test: { id: string; name: string };
}

export interface ResultUpsertInput {
  visitTestId: string;
  values: {
    parameterId: string;
    value: string;
    notes?: string | null;
    abnormalOverride?: boolean | null;
  }[];
  expectedVersion?: number;
}

export interface DiscountInput { invoiceId: string; amount: number; isPercent: boolean; }

export interface UserRow {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface UserCreateInput {
  name: string;
  username: string;
  password: string;
  role: Role;
}

export interface UserCreateResult {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
}

export type AuditListInput = {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};
export type AuditListRow = {
  id: string;
  userId: string;
  action: string;
  targetEntity: string;
  targetId: string;
  details: string | null;
  timestamp: string; // serialized to ISO over IPC
  user: { id: string; name: string; username: string };
};
export type AuditListResult = { rows: AuditListRow[]; total: number };

export interface BackupLogRow {
  id: string;
  kind: string;            // "auto" | "manual"
  destination: string;
  sizeBytes: string;       // BigInt serialized as string for IPC
  status: string;          // "success" | "failed"
  error: string | null;
  createdAt: string | Date;
}

export interface BackupRestoreInput { backupLogId: string; }
export interface BackupRestoreResult { ok: true; }

export interface UserResetPasswordInput { id: string; newPassword: string; }
export interface UserSetActiveInput   { id: string; isActive: boolean; }
export interface UserUpdateRoleInput  { id: string; role: Role; }
export interface UserDeleteInput      { id: string; }
export interface UserMutationResult   { ok: true; }

export type PaymentLinksStats = {
  activeCount: number;
  activeOutstandingTotal: number;
  failedCount: number;
};

export type DashboardStats = {
  today: {
    visits: number;
    tests: number;
    reports: number;
    reportsPending: number;
    deltaVisits: number;
  };
  money: { billed: number; collected: number; discount: number } | null;
  backlog: { pendingResults: number; openVisits: number; outsourcedSent: number };
};

export type TemplateRow = {
  id: string;
  name: string;
  isDefault: boolean;
  config: string;        // JSON string
  createdAt: string;
  updatedAt: string;
};

export type TemplateSaveInput = { id?: string; name: string; config: TemplateConfig };
export type TemplateIdInput = { id: string };

export type Api = {
  invoke<T = unknown>(channel: Channel, payload?: unknown): Promise<IpcResult<T>>;
  onUpdateDownloaded(cb: (info: { version: string }) => void): () => void;
};

declare global {
  interface Window { api: Api; }
}

export type { SessionUser, IpcResult, Role, VisitTestStatus };
