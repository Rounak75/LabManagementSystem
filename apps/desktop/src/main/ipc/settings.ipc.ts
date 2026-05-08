import { app as electronApp } from "electron";
import { copyFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";

register("settings:get", async () => {
  requireSession();
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s) throw new Error("NOT_FOUND");
  return s;
});

register("settings:update", async (input: any) => {
  requireAdmin();
  const s = await prisma().labSettings.update({ where: { id: "singleton" }, data: input });
  await audit("UPDATE", "LabSettings", "singleton");
  return s;
});

register("settings:uploadLogo", async (p: { sourcePath: string }) => {
  requireAdmin();
  const ext = extname(p.sourcePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) throw new Error("INVALID_INPUT");
  const stat = statSync(p.sourcePath);
  if (stat.size > 256 * 1024) throw new Error("FILE_TOO_LARGE");

  const dir = join(electronApp.getPath("userData"), "assets");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dest = join(dir, `logo${ext}`);
  copyFileSync(p.sourcePath, dest);

  await prisma().labSettings.update({ where: { id: "singleton" }, data: { labLogo: dest } });
  await audit("SETTINGS_LOGO_UPDATED", "LabSettings", "singleton");
  return { path: dest };
});

register("settings:removeLogo", async () => {
  requireAdmin();
  await prisma().labSettings.update({ where: { id: "singleton" }, data: { labLogo: null } });
  await audit("SETTINGS_LOGO_REMOVED", "LabSettings", "singleton");
  return { ok: true as const };
});
