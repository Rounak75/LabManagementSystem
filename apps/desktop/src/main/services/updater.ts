import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { logError } from "@main/services/logger";

const STARTUP_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Wire the auto-updater. No-op in dev (updater requires a packaged build). */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

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

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
