import { register } from "@main/ipc";
import { app } from "electron";
import { copyFileSync } from "fs";
import { prisma } from "@main/db";
import { requireAdmin } from "@main/session";
import { audit } from "@main/services/audit.service";
import { runBackup } from "@main/services/backup.service";

function serializeBackupLog(row: {
  id: string;
  kind: string;
  destination: string;
  sizeBytes: bigint;
  status: string;
  error: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    kind: row.kind,
    destination: row.destination,
    sizeBytes: row.sizeBytes.toString(),
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
  };
}

register("backup:runNow", async () => {
  requireAdmin();
  const settings = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  const log = await runBackup({ kind: "manual", secondaryPath: settings?.backupPath ?? null });
  await audit("BACKUP_MANUAL", "BackupLog", log.id, JSON.stringify({ status: log.status }));
  return serializeBackupLog(log);
});

register("backup:list", async () => {
  requireAdmin();
  const rows = await prisma().backupLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  return rows.map(serializeBackupLog);
});

register("backup:restore", async (p: { backupLogId: string }) => {
  requireAdmin();
  const log = await prisma().backupLog.findUnique({ where: { id: p.backupLogId } });
  if (!log || log.status !== "success") throw new Error("NOT_FOUND");
  // 1. Pre-restore safety backup
  await runBackup({ kind: "manual", filenamePrefix: "pre-restore" });
  // 2. Audit BEFORE disconnect (Windows file-lock safety)
  await audit("BACKUP_RESTORED", "BackupLog", p.backupLogId);
  // 3. Resolve DB path from DATABASE_URL
  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbPath = dbUrl.replace(/^file:/, "");
  if (!dbPath) throw new Error("INTERNAL_ERROR");
  // 4. Disconnect Prisma so the file is releasable on Windows
  await prisma().$disconnect();
  // 5. Copy chosen backup over lab.sqlite
  copyFileSync(log.destination, dbPath);
  app.relaunch();
  app.quit();
  return { ok: true };
});

export {};
