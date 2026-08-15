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
  | "visits:setReportReleaseOverride"
  | "visitTests:getOne" | "visitTests:updateStatus" | "visitTests:lock"
  | "visitTests:unlock"
  // outsourced
  | "outsourced:list" | "outsourced:markReceived"
  // results
  | "results:upsert" | "results:listForVisit"
  // invoices
  | "invoices:get" | "invoices:applyDiscount" | "invoices:recordCash" | "invoices:recordUpi"
  | "invoices:cancel"
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
  | "app:getVersion" | "updater:quitAndInstall" | "updater:checkNow" | "updater:download"
  // backup (admin only, except getHealth which any session can read)
  | "backup:runNow" | "backup:list" | "backup:restore" | "backup:getHealth"
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
  | "bookings:listPhlebotomists" | "bookings:listUnconverted" | "bookings:resolveApproved"
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

/**
 * A staff account as the renderer receives it.
 *
 * Dates are `string`, not `Date`: every reply is JSON round-tripped by
 * `stripNonCloneable` on the way out of main, so a `Date` always arrives as an
 * ISO string. The old `string | Date` hedge described neither side honestly and
 * pushed the narrowing onto every call site.
 *
 * `canCollectSamples` was missing here for as long as the field has existed —
 * the renderer kept its own copy of this type to get at it. Both copies are gone
 * now; this is the one.
 */
export interface UserRow {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  canCollectSamples: boolean;
  createdAt: string;
  updatedAt: string;
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

/** How loudly the backup verdict should be shown. "ok" means show nothing. */
export type BackupTone = "ok" | "warn" | "alarm";

/**
 * The dashboard's one-line verdict on backups, from `backup:getHealth`.
 *
 * Lives here rather than beside the logic in main so the renderer can name the
 * shape without importing across the main/renderer boundary — the same reason
 * `DashboardStats` is here and not in the service that builds it.
 */
export interface BackupHealth {
  tone: BackupTone;
  headline: string;
  /** A second line, or null when the headline says everything. */
  detail: string | null;
}

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

/**
 * What each channel takes and returns — the one place the two sides agree.
 *
 * A channel listed here is checked at both ends: `register` in main will not
 * accept a handler whose payload or return type disagrees, and `call` in the
 * renderer resolves the return type from the channel name instead of taking the
 * caller's word for it. Before this existed the same operation was declared
 * three times — a name in `Channel`, a payload type inline on the handler, and a
 * `call<T>` at each call site — and nothing compared them.
 *
 * Use `void` for a channel that takes no payload; `call` then rejects an
 * argument rather than silently ignoring it.
 *
 * Migrating a channel is deliberately all-or-nothing. Adding an entry here makes
 * the loose `call<T>` overload stop accepting that channel, so every call site
 * has to move in the same change. A half-migrated channel would type-check while
 * proving nothing, which is the state this is meant to end.
 */
export interface ChannelContract {
  // auth + session
  "auth:firstRunNeeded":   { input: void;                   output: boolean };
  "auth:firstRunComplete": { input: FirstRunInput;          output: FirstRunCompleteResult };
  "auth:login":            { input: LoginInput;             output: SessionUser };
  "auth:logout":           { input: void;                   output: boolean };
  "auth:currentUser":      { input: void;                   output: SessionUser | null };
  "auth:recoverPassword":  { input: RecoverPasswordInput;   output: RecoverPasswordResult };

  // backup
  "backup:runNow":    { input: void;                 output: BackupLogRow };
  "backup:list":      { input: void;                 output: BackupLogRow[] };
  "backup:getHealth": { input: void;                 output: BackupHealth };
  "backup:restore":   { input: BackupRestoreInput;   output: BackupRestoreResult };

  // dashboard
  "dashboard:stats":            { input: void; output: DashboardStats };
  "dashboard:paymentLinksStats": { input: void; output: PaymentLinksStats };

  // app utilities + updater
  "app:saveTextFile":       { input: SaveTextFileInput; output: SaveTextFileResult };
  "app:pickDirectory":      { input: void;              output: string | null };
  "app:pickFile":           { input: PickFileInput;     output: string | null };
  "app:logError":           { input: LogErrorInput;     output: { ok: true } };
  "app:getVersion":         { input: void;              output: { version: string } };
  "updater:quitAndInstall": { input: void;              output: { ok: true } };
  "updater:checkNow":       { input: void;              output: { ok: true } };
  "updater:download":       { input: void;              output: { ok: true } };

  // users + audit (read paths; the users mutations still need service return types)
  "users:list":             { input: void; output: UserRow[] };
  "audit:distinctActions":  { input: void; output: string[] };
}

/**
 * Compile-time proof that every key above is a real channel. If a contract entry
 * is misspelled or names a channel that has been retired, `Exclude` stops being
 * `never` and the default violates its own constraint. Emits nothing.
 */
export type _ContractKeysAreChannels<
  T extends never = Exclude<keyof ChannelContract, Channel>,
> = T;

/** A channel whose input and output are pinned down by {@link ChannelContract}. */
export type ContractedChannel = keyof ChannelContract & Channel;

/** A channel not yet in the contract — still uses the loose `call<T>` form. */
export type LooseChannel = Exclude<Channel, ContractedChannel>;

export type ChannelInput<C extends ContractedChannel> = ChannelContract[C]["input"];
export type ChannelOutput<C extends ContractedChannel> = ChannelContract[C]["output"];

/**
 * The payload arguments for a contracted channel: none at all when its input is
 * `void`, exactly one otherwise. Wrapping both sides in a tuple keeps the
 * conditional from distributing over a union input.
 */
export type ChannelArgs<C extends ContractedChannel> =
  [ChannelInput<C>] extends [void] ? [] : [payload: ChannelInput<C>];

export type Api = {
  invoke<T = unknown>(channel: Channel, payload?: unknown): Promise<IpcResult<T>>;
  onUpdateAvailable(cb: (info: { version: string }) => void): () => void;
  onUpdateDownloaded(cb: (info: { version: string }) => void): () => void;
};

declare global {
  interface Window { api: Api; }
}

export type { SessionUser, IpcResult, Role, VisitTestStatus };
