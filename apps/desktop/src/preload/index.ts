import { contextBridge, ipcRenderer } from "electron";
import type { Api, Channel } from "@shared/api";

const api: Api = {
  invoke: (channel: Channel, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  onUpdateAvailable: (cb) => {
    const handler = (_e: unknown, info: { version: string }) => cb(info);
    ipcRenderer.on("updater:update-available", handler);
    return () => ipcRenderer.removeListener("updater:update-available", handler);
  },
  onUpdateDownloaded: (cb) => {
    const handler = (_e: unknown, info: { version: string }) => cb(info);
    ipcRenderer.on("updater:update-downloaded", handler);
    return () => ipcRenderer.removeListener("updater:update-downloaded", handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
