import { register } from "@main/ipc";
import { logError } from "@main/services/logger";
import { quitAndInstall, checkNow } from "@main/services/updater";
import type { LogErrorInput } from "@shared/api";
import { app, dialog } from "electron";
import { writeFile } from "fs/promises";

register("app:saveTextFile", async (payload: { filename: string; contents: string }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: payload.filename });
  if (canceled || !filePath) return { saved: false };
  await writeFile(filePath, payload.contents, "utf8");
  return { saved: true, path: filePath };
});

register("app:pickDirectory", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0] ?? null;
});

register("app:pickFile", async (p: { filters?: { name: string; extensions: string[] }[] }) => {
  const r = await dialog.showOpenDialog({ properties: ["openFile"], filters: p?.filters ?? [] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0] ?? null;
});

register("app:logError", (input: LogErrorInput) => {
  const detail = input.stack ? `${input.message}\n${input.stack}` : input.message;
  logError(`renderer:${input.scope}`, detail);
  return { ok: true };
});

register("app:getVersion", () => ({ version: app.getVersion() }));

register("updater:quitAndInstall", () => { quitAndInstall(); return { ok: true }; });

register("updater:checkNow", async () => { await checkNow(); return { ok: true }; });
