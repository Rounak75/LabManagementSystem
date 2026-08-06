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
import { startPrintQueueWorker, stopPrintQueueWorker } from "@main/services/print-queue.worker";
import { checkSchemaDrift } from "@main/services/cloud/schema-drift";
import { runReconciliation } from "@main/services/cloud/reconciliation";
import { pushCatalogueToCloud } from "@main/services/cloud/backfill.service";
import { migrateLogoFieldOnce } from "@main/services/report.service";
import { migrateTestCategoriesOnce } from "@main/services/category-migration.service";
import { reconcileTestCatalogueOnce } from "@main/services/catalogue-reconciliation.service";
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
    // Shown from `ready-to-show` instead of immediately. Electron paints a new
    // window white the moment it is created, so the app opened on an empty white
    // rectangle and sat there until the renderer had parsed its bundle and React
    // had mounted — which is the blank screen the owner sees, not a slow boot.
    // Waiting means the window appears already drawn.
    show: false,
    // Still worth setting: this is the colour of the frame between the window
    // appearing and the first paint, and of any resize the compositor has not
    // caught up with. Matches the app background (Tailwind slate-50).
    backgroundColor: "#f8fafc",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  // Belt and braces: if the renderer fails badly enough never to reach
  // ready-to-show, a window that is never shown leaves the owner with no app and
  // no error either. Better a blank window than an invisible one.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      logError("boot:window", "renderer never reported ready-to-show — showing anyway");
      mainWindow.show();
    }
  }, 10_000);
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

/**
 * Idempotent housekeeping that runs on every boot and that the first screen does
 * not depend on.
 *
 * All of it used to run *before* `createWindow()`, so the owner watched an empty
 * desktop while the app re-checked conversions that had already happened years
 * of boots ago. None of it is needed to log in or to see the dashboard: the logo
 * conversion matters when a report is rendered, the template seed and catalogue
 * reconciliation matter when the catalogue is opened, and by then this has long
 * since finished.
 *
 * Each step is guarded separately so one failure cannot skip the rest.
 */
async function runBootMaintenance(): Promise<void> {
  // One-time idempotent migration: convert legacy file-path logos to data URIs.
  try { await migrateLogoFieldOnce(); } catch (err) { logError("boot:logo-migration", err); }
  try { await seedGolmuriTemplate(prisma()); } catch (err) { logError("seed:template", err); }
  // Outside the seed guard on purpose: an existing install already exceeds the
  // test-count threshold, so anything behind it would never run again.
  try { await reconcileTestCatalogueOnce(); } catch (err) { logError("seed:catalogue", err); }
  try { await migrateTestCategoriesOnce(); } catch (err) { logError("boot:category-migration", err); }
}

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
  // Seeds are idempotent; skip the per-test queries entirely once fully seeded.
  // This one stays ahead of the window because a fresh install has no catalogue
  // at all, and the first screen is not worth showing without one. It runs once
  // in the life of the install.
  const testCount = await prisma().test.count();
  if (testCount < EXPECTED_SEED_TEST_COUNT) {
    try { await seedGolmuriTests(prisma()); } catch (err) { logError("seed:golmuri", err); }
    try { await seedSpecialTests(prisma()); } catch (err) { logError("seed:special", err); }
  }

  createWindow();
  logError("boot:timing", `window created in ${Date.now() - bootStart}ms`);

  await runBootMaintenance();
  initAutoUpdater(() => mainWindow);
  startScheduler();
  startNotificationsScheduler();
  startPaymentsPoller();
  // Deliberately outside the cloud-sync guard below: this drains jobs already in
  // the local queue, which still need printing even on a boot where schema drift
  // has held cloud sync back.
  startPrintQueueWorker();
  try {
    const drift = await checkSchemaDrift();
    if (drift.ok) {
      await runReconciliation();
      // Re-state the catalogue after reconciliation has settled it. Reconciliation
      // is idempotent, so on every boot after the first it writes nothing and the
      // outbox stays silent — leaving the cloud on whatever the catalogue looked
      // like before it ever ran. That is why the staff portal went on offering
      // retired duplicate tests, and offered no parameters to type results into.
      try {
        await pushCatalogueToCloud();
      } catch (e) {
        logError("cloud:catalogue-push", e);
      }
      startCloudSyncWorker();
    } else {
      logError("cloud:schema-drift", `cloud sync disabled; missing: ${JSON.stringify(drift.missing)}`);
    }
  } catch (e) {
    logError("cloud:startup", e);
  }
});
app.on("before-quit", () => { stopScheduler(); stopNotificationsScheduler(); stopPaymentsPoller(); stopCloudSyncWorker(); stopPrintQueueWorker(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
