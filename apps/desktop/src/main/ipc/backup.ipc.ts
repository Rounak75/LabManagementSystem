import { register } from "@main/ipc";
import { app } from "electron";
import { copyFileSync } from "fs";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";
import { runBackup } from "@main/services/backup.service";
import { describeBackupHealth } from "@main/services/backup-health";

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

/**
 * The one-line verdict the dashboard card shows.
 *
 * `requireSession` rather than `requireAdmin`, matching `cloud:getStatus`: the
 * card sits on the dashboard, and a staff member who cannot see it is a staff
 * member who cannot tell the owner the drive has been unplugged for a week.
 * Reading a verdict is not the same permission as running or restoring one.
 *
 * Known limit on `lastOffMachineSuccessAt`: BackupLog does not record whether a
 * run attempted an off-machine copy, only its combined verdict, so a "success"
 * written while no backup path was configured counts here as though it had one.
 * The consequence is bounded — the elapsed time can read younger than the truth,
 * never older, and the "never configured" case alarms on its own before this
 * value is consulted. Recording the attempt would need a schema change, which is
 * not worth it for a number shown beside an alarm that is already firing.
 */
register("backup:getHealth", async () => {
  requireSession();

  const [settings, latest, lastOffMachineSuccess] = await Promise.all([
    prisma().labSettings.findUnique({ where: { id: "singleton" } }),
    prisma().backupLog.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma().backupLog.findFirst({
      where: { status: "success" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return describeBackupHealth({
    latest: latest ? { status: latest.status, createdAt: latest.createdAt } : null,
    lastOffMachineSuccessAt: lastOffMachineSuccess?.createdAt ?? null,
    offMachineConfigured: Boolean(settings?.backupPath),
    now: new Date(),
  });
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
