import { ipcMain } from "electron";
import type { Channel } from "@shared/api";
import type { IpcResult } from "@lab/types";

type Handler = (payload: any) => Promise<unknown> | unknown;
const handlers = new Map<Channel, Handler>();

export function register(channel: Channel, handler: Handler) {
  handlers.set(channel, handler);
}

export function attachIpc() {
  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, async (_event, payload): Promise<IpcResult<unknown>> => {
      try {
        const data = await handler(payload);
        return { ok: true, data: stripNonCloneable(data) };
      } catch (err) {
        const e = err as Error;
        const code = /^[A-Z_]+$/.test(e.message) ? e.message : "INTERNAL_ERROR";
        const message = code === "INTERNAL_ERROR" ? e.message : codeToMessage(code);
        return { ok: false, error: { code, message } };
      }
    });
  }
}

/**
 * Round-trip through JSON to convert non-cloneable values into plain
 * JS primitives before Electron's structured-clone serialization.
 *
 *   Prisma Decimal → string  (via its built-in toJSON)
 *   BigInt         → string  (via replacer)
 *   Date           → string  (via built-in toJSON — all frontend code handles ISO strings)
 *
 * Without this, any IPC handler returning Prisma Decimal fields
 * (Test.price, TestParameter.refRange*, Invoice.total, etc.)
 * crashes with "An object could not be cloned".
 */
function stripNonCloneable(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  return JSON.parse(JSON.stringify(data, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    return value;
  }));
}

function codeToMessage(code: string): string {
  switch (code) {
    case "UNAUTHENTICATED": return "Please log in.";
    case "FORBIDDEN":       return "You don't have permission for this action.";
    case "NOT_FOUND":       return "Record not found.";
    case "DUPLICATE_PHONE": return "A patient with that phone number already exists.";
    case "DUPLICATE_USERNAME": return "Username is already taken.";
    case "INVALID_INPUT":   return "Some fields are invalid.";
    case "ADMIN_LOCKOUT_PROTECTED": return "You can't disable yourself while you're the only Admin.";
    case "INVALID_RECOVERY_CODE": return "That recovery code is wrong.";
    case "BACKUP_PATH_UNREACHABLE": return "Couldn't write to the secondary backup location.";
    case "TEMPLATE_IN_USE": return "Can't delete a template that's set as default.";
    case "USER_HAS_HISTORY": return "This user has activity in the audit log — disable them instead of deleting.";
    case "FILE_TOO_LARGE":  return "File is too large (max 256 KB).";
    case "INVALID_STATE":   return "That action isn't allowed in the current state.";
    case "STALE_VERSION":   return "Someone else updated these results since you opened the page. Reload and try again.";
    case "REASON_REQUIRED": return "A reason is required (at least 10 characters).";
    case "INVOICE_PAID_BEFORE_UNLOCK": return "The invoice is paid — cancel it first before unlocking results.";
    case "PATIENT_HAS_VISITS": return "Cancel the patient's visits first, then delete the patient.";
    case "VISIT_HAS_LOCKED_RESULTS": return "This visit has verified results — cannot cancel.";
    case "VISIT_INVOICE_PAID": return "Invoice is paid — refund the invoice first.";
    case "VISIT_DELETED":   return "This visit has been cancelled.";
    case "PARAMETER_HAS_RESULTS": return "Parameter is used by existing results — deactivate instead of removing.";
    case "EMPTY_PARAMETERS": return "Some parameters have no value.";
    case "INVALID_PASSWORD": return "Password incorrect.";
    case "SECRET_UNREADABLE": return "Stored secret can't be read (probably from an old app version). Please re-enter it and click Save.";
    case "CLOUD_NOT_CONFIGURED": return "Cloud sync isn't fully configured yet. Fill in all three Supabase fields and click Save first.";
    default: return code;
  }
}
