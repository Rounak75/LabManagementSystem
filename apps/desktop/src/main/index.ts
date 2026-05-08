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
import { startScheduler, stopScheduler } from "@main/services/backup.service";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false }
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => { initDatabase(); attachIpc(); createWindow(); startScheduler(); });
app.on("before-quit", () => { stopScheduler(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
