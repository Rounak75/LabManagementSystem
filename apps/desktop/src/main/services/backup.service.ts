import { app } from "electron";
import { join } from "path";
import { mkdirSync, statSync, readdirSync, unlinkSync, existsSync } from "fs";
import { prisma } from "@main/db";
import { paymentDueScan, homeVisitReminderScan } from "@main/services/notifications/triggers";

function backupDir(): string {
  const dir = join(app.getPath("userData"), "backups");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function runBackup(opts: {
  kind: "auto" | "manual";
  secondaryPath?: string | null;
  filenamePrefix?: string;
}) {
  const prefix = opts.filenamePrefix ?? "lab";
  const filename = `${prefix}-${timestamp()}.sqlite`;
  const primary = join(backupDir(), filename);
  try {
    // VACUUM INTO doesn't accept a parameterized path in all SQLite builds;
    // path is server-controlled, but escape single quotes defensively.
    const safePrimary = primary.replace(/'/g, "''");
    await prisma().$queryRawUnsafe(`VACUUM INTO '${safePrimary}'`);
    const sizeBytes = BigInt(statSync(primary).size);

    if (opts.secondaryPath) {
      try {
        if (!existsSync(opts.secondaryPath)) mkdirSync(opts.secondaryPath, { recursive: true });
        const secondary = join(opts.secondaryPath, filename);
        const safeSecondary = secondary.replace(/'/g, "''");
        await prisma().$queryRawUnsafe(`VACUUM INTO '${safeSecondary}'`);
      } catch (err) {
        await prisma().backupLog.create({
          data: {
            kind: opts.kind,
            destination: opts.secondaryPath,
            sizeBytes: BigInt(0),
            status: "failed",
            error: String(err),
          },
        });
      }
    }

    const log = await prisma().backupLog.create({
      data: { kind: opts.kind, destination: primary, sizeBytes, status: "success" },
    });
    await prisma().labSettings.update({
      where: { id: "singleton" },
      data: { lastBackupAt: new Date() },
    });
    return log;
  } catch (err) {
    return prisma().backupLog.create({
      data: {
        kind: opts.kind,
        destination: primary,
        sizeBytes: BigInt(0),
        status: "failed",
        error: String(err),
      },
    });
  }
}

export function pruneOld(retentionDays: number): number {
  const dir = backupDir();
  const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("lab-") || !name.endsWith(".sqlite")) continue;
    const full = join(dir, name);
    if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      removed++;
    }
  }
  return removed;
}

let timer: NodeJS.Timeout | null = null;
let lastDayRan: string | null = null;

export function startScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      const settings = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
      if (!settings) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toDateString();
      if (hhmm === settings.backupTime && lastDayRan !== today) {
        lastDayRan = today;
        await runBackup({ kind: "auto", secondaryPath: settings.backupPath });
        pruneOld(settings.backupRetentionDays);
        try {
          const n = await paymentDueScan();
          if (n > 0) console.log(`[notifications] paymentDueScan enqueued ${n}`);
        } catch (err) {
          console.error("[notifications] paymentDueScan failed", err);
        }
        try {
          const n = await homeVisitReminderScan();
          if (n > 0) console.log(`[notifications] homeVisitReminderScan enqueued ${n}`);
        } catch (err) {
          console.error("[notifications] homeVisitReminderScan failed", err);
        }
      }
    } catch {
      // never crash the app from the scheduler
    }
  }, 60_000);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
