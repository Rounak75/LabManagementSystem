import { register } from "@main/ipc";
import { dialog } from "electron";
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
