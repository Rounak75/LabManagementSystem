import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { logError } from "@main/services/logger";

const STARTUP_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Wire the auto-updater. No-op in dev (updater requires a packaged build). */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  // Downloads wait for the operator. The installer is not code-signed, so
  // electron-updater has no signature to check and would install whatever the
  // release repo serves — silently, on every lab PC. Requiring a click is what
  // makes an unexpected release visible. Once signing is in place this can go
  // back to true, because verification then happens before install.
  autoUpdater.autoDownload = false;
  // Safe to keep: nothing reaches this point unless the operator asked for it.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info: { version: string }) => {
    getWindow()?.webContents.send("updater:update-available", { version: info.version });
  });
  autoUpdater.on("update-downloaded", (info: { version: string }) => {
    getWindow()?.webContents.send("updater:update-downloaded", { version: info.version });
  });
  // Offline / GitHub unreachable / no release yet all surface here — log and ignore.
  autoUpdater.on("error", (err) => logError("updater", err));

  setTimeout(() => { void checkNow(); }, STARTUP_DELAY_MS);
  setInterval(() => { void checkNow(); }, CHECK_INTERVAL_MS);
}

/** Trigger a check now; never throws (offline is normal for this lab PC). */
export async function checkNow(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    logError("updater:check", err);
  }
}

/**
 * Fetch the update the operator just agreed to. Never throws — a download that
 * dies halfway is the same non-event as being offline, and the banner stays put
 * so they can try again.
 */
export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    logError("updater:download", err);
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
