import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { audit as auditServiceCall } from "./audit.service";

/**
 * Stable AuditInput shape exposed to call sites (tasks 10/11/13/14/15/21/23).
 * The underlying audit.service.ts uses positional args
 * `(action, targetEntity, targetId, details?)`, where the user id is read
 * from the active session. We adapt that here so all call sites can use
 * a single named-arg shape.
 *
 * `userId` is currently informational only (the underlying logger uses
 * the session user). It is still persisted in the audit-errors.log line
 * so a failing audit attempt can be reconciled with the acting user.
 */
export type AuditInput = {
  entityType: string;
  entityId: string;
  userId: string;
  details?: unknown;
};

export type AuditCall = { action: string } & AuditInput;

/**
 * Default underlying call. Maps the named-arg AuditInput shape onto the
 * positional signature of `audit.service.audit`.
 */
async function defaultUnderlying(a: AuditCall): Promise<unknown> {
  const detailsStr =
    a.details === undefined || a.details === null
      ? undefined
      : typeof a.details === "string"
        ? a.details
        : JSON.stringify(a.details);
  await auditServiceCall(a.action, a.entityType, a.entityId, detailsStr);
  return undefined;
}

export const audit = {
  /**
   * Best-effort audit logging.
   *
   * Calls the underlying audit function. If it throws (e.g. DB locked,
   * disk full, schema mismatch) the error is appended to
   * `<userData>/audit-errors.log` as a single JSON line and the promise
   * still resolves to `undefined`. Under no circumstance does this
   * function throw — even if writing the side log itself fails.
   */
  async try(
    action: string,
    input: AuditInput,
    fn: (a: AuditCall) => Promise<unknown> = defaultUnderlying
  ): Promise<void> {
    try {
      await fn({ action, ...input });
    } catch (err) {
      try {
        const logFile = path.join(app.getPath("userData"), "audit-errors.log");
        const line = JSON.stringify({
          ts: new Date().toISOString(),
          action,
          ...input,
          error: err instanceof Error ? err.message : String(err)
        });
        fs.appendFileSync(logFile, line + "\n");
      } catch {
        // swallow — never throw
      }
    }
  }
};
