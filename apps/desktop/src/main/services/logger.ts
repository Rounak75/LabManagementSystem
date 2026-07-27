import { app } from "electron";
import * as fs from "fs";
import { join } from "path";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
const MAX_FILES = 3;               // lab-errors.log + .1 + .2

let cachedPath: string | null = null;

export function logFilePath(): string {
  if (!cachedPath) cachedPath = join(app.getPath("logs"), "lab-errors.log");
  return cachedPath;
}

/** Test-only: clear the cached path so a fresh temp dir is picked up. */
export function __resetLoggerForTests(): void {
  cachedPath = null;
}

function rotateIfNeeded(file: string): void {
  try {
    const stat = fs.statSync(file);
    if (stat.size < MAX_BYTES) return;
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const src = i === 1 ? file : `${file}.${i - 1}`;
      const dst = `${file}.${i}`;
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    }
  } catch {
    /* file doesn't exist yet — nothing to rotate */
  }
}

const REDACTED = "[redacted]";

/**
 * Strips patient-identifying values from a log line.
 *
 * The fatal-error dialog tells the owner to send this file to support, and Prisma
 * puts the failing query's argument values straight into its error messages — so
 * patient names, phone numbers and result values were being written to a
 * plaintext file that the app actively encourages emailing off the premises.
 *
 * What failed and where is preserved: operation names, file paths and line
 * numbers are untouched, only the values are removed.
 */
export function redactPii(message: string): string {
  return (
    message
      // Quoted values in a Prisma invocation's argument object.
      .replace(/"(?:[^"\\]|\\.)*"/g, `"${REDACTED}"`)
      .replace(/'(?:[^'\\]|\\.)*'/g, `'${REDACTED}'`)
      // Email addresses and Indian mobile numbers appearing bare in a message.
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED)
      .replace(/\b\d{10}\b/g, REDACTED)
  );
}

/** Append a timestamped error line to the rotating log file. Never throws. */
export function logError(scope: string, err: unknown): void {
  try {
    const file = logFilePath();
    fs.mkdirSync(join(file, ".."), { recursive: true });
    rotateIfNeeded(file);
    const raw =
      err instanceof Error ? (err.stack ?? err.message)
      : typeof err === "string" ? err
      : err === undefined || err === null ? "(no error value)"
      : JSON.stringify(err);
    fs.appendFileSync(file, `${new Date().toISOString()} [${scope}] ${redactPii(raw)}\n`);
  } catch {
    /* logging must never crash the app */
  }
}
