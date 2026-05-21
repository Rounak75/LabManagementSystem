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

/** Append a timestamped error line to the rotating log file. Never throws. */
export function logError(scope: string, err: unknown): void {
  try {
    const file = logFilePath();
    fs.mkdirSync(join(file, ".."), { recursive: true });
    rotateIfNeeded(file);
    const message =
      err instanceof Error ? (err.stack ?? err.message)
      : typeof err === "string" ? err
      : err === undefined || err === null ? "(no error value)"
      : JSON.stringify(err);
    fs.appendFileSync(file, `${new Date().toISOString()} [${scope}] ${message}\n`);
  } catch {
    /* logging must never crash the app */
  }
}
