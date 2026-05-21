import { app, BrowserWindow, dialog } from "electron";
import { join } from "path";
import { initDatabase } from "@main/db";
import { attachIpc } from "@main/ipc";
import "@main/ipc/auth.ipc";
import "@main/ipc/settings.ipc";
import "@main/ipc/doctors.ipc";
import "@main/ipc/tests.ipc";
import "@main/ipc/patients.ipc";
import "@main/ipc/visits.ipc";
import "@main/ipc/results.ipc";
import "@main/ipc/invoices.ipc";
import "@main/ipc/reports.ipc";
import "@main/ipc/audit.ipc";
import "@main/ipc/users.ipc";
import "@main/ipc/outsourced.ipc";
import "@main/ipc/app.ipc";
import "@main/ipc/backup.ipc";
import "@main/ipc/dashboard.ipc";
import "@main/ipc/templates.ipc";
import "@main/ipc/notifications.ipc";
import "@main/ipc/payments.ipc";
import "@main/ipc/cloud.ipc";
// Phase 3d additions
import "@main/ipc/printer-calibration.ipc";
import "@main/ipc/bookings.ipc";
import "@main/ipc/closures.ipc";
import "@main/ipc/dispute.ipc";
import { startScheduler, stopScheduler } from "@main/services/backup.service";
import { start as startNotificationsScheduler, stop as stopNotificationsScheduler } from "@main/services/notifications/scheduler";
import { startPaymentsPoller, stopPaymentsPoller } from "@main/services/payments/poller";
import { startCloudSyncWorker, stopCloudSyncWorker } from "@main/services/cloud/sync-worker";
import { checkSchemaDrift } from "@main/services/cloud/schema-drift";
import { runReconciliation } from "@main/services/cloud/reconciliation";
import { migrateLogoFieldOnce } from "@main/services/report.service";
import { migrateTestCategoriesOnce } from "@main/services/category-migration.service";
import { seedGolmuriTests, GOLMURI_SEED_COUNT } from "@main/services/seed-golmuri-tests";
import { seedSpecialTests, SPECIAL_SEED_COUNT } from "@main/services/seed-special-tests";
import { seedGolmuriTemplate } from "@main/services/seed-golmuri-template";
import { logError } from "@main/services/logger";
import { initAutoUpdater } from "@main/services/updater";
import { prisma } from "@main/db";

const EXPECTED_SEED_TEST_COUNT = GOLMURI_SEED_COUNT + SPECIAL_SEED_COUNT;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false }
  });
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

function showFatalDialog(scope: string, err: unknown): void {
  logError(scope, err);
  try {
    dialog.showMessageBoxSync({
      type: "error",
      title: "Golmuri Janch Ghar Lab",
      message: "Something went wrong on the lab computer.",
      detail: "The problem has been recorded in the error log. Please restart the app. If it keeps happening, send the error log to support.",
      buttons: ["OK"],
    });
  } catch {
    /* dialog may be unavailable very early in startup */
  }
}

process.on("uncaughtException", (err) => showFatalDialog("uncaughtException", err));
process.on("unhandledRejection", (reason) => logError("unhandledRejection", reason));

app.whenReady().then(async () => {
  const bootStart = Date.now();
  try {
    await initDatabase();
    attachIpc();
  } catch (err) {
    showFatalDialog("boot:database", err);
    app.quit();
    return;
  }
  // One-time idempotent migration: convert legacy file-path logos to data URIs.
  // Runs every boot but is a no-op once the conversion has happened.
  await migrateLogoFieldOnce();
  // Seeds are idempotent; skip the per-test queries entirely once fully seeded.
  const testCount = await prisma().test.count();
  if (testCount < EXPECTED_SEED_TEST_COUNT) {
    try { await seedGolmuriTests(prisma()); } catch (err) { logError("seed:golmuri", err); }
    try { await seedSpecialTests(prisma()); } catch (err) { logError("seed:special", err); }
  }
  try { await seedGolmuriTemplate(prisma()); } catch (err) { logError("seed:template", err); }
  await migrateTestCategoriesOnce();
  createWindow();
  logError("boot:timing", `window created in ${Date.now() - bootStart}ms`);
  initAutoUpdater(() => mainWindow);
  startScheduler();
  startNotificationsScheduler();
  startPaymentsPoller();
  try {
    const drift = await checkSchemaDrift();
    if (drift.ok) {
      await runReconciliation();
      startCloudSyncWorker();
    } else {
      logError("cloud:schema-drift", `cloud sync disabled; missing: ${JSON.stringify(drift.missing)}`);
    }
  } catch (e) {
    logError("cloud:startup", e);
  }
});
app.on("before-quit", () => { stopScheduler(); stopNotificationsScheduler(); stopPaymentsPoller(); stopCloudSyncWorker(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
