import { app, BrowserWindow } from "electron";
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
import { seedGolmuriTests } from "@main/services/seed-golmuri-tests";
import { seedSpecialTests } from "@main/services/seed-special-tests";
import { seedGolmuriTemplate } from "@main/services/seed-golmuri-template";
import { prisma } from "@main/db";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false }
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(async () => {
  initDatabase();
  attachIpc();
  // One-time idempotent migration: convert legacy file-path logos to data URIs.
  // Runs every boot but is a no-op once the conversion has happened.
  await migrateLogoFieldOnce();
  try { await seedGolmuriTests(prisma()); } catch (err) { console.error("Golmuri seed failed:", err); }
  try { await seedSpecialTests(prisma()); } catch (err) { console.error("Special seed failed:", err); }
  try { await seedGolmuriTemplate(prisma()); } catch (err) { console.error("Golmuri template seed failed:", err); }
  await migrateTestCategoriesOnce();
  createWindow();
  startScheduler();
  startNotificationsScheduler();
  startPaymentsPoller();
  try {
    const drift = await checkSchemaDrift();
    if (drift.ok) {
      await runReconciliation();
      startCloudSyncWorker();
    } else {
      console.warn("[cloud] schema drift detected; cloud sync disabled", drift.missing);
    }
  } catch (e) {
    console.error("[cloud] startup failed", e);
  }
});
app.on("before-quit", () => { stopScheduler(); stopNotificationsScheduler(); stopPaymentsPoller(); stopCloudSyncWorker(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
