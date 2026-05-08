import { contextBridge, ipcRenderer } from "electron";
import type { Api, Channel } from "@shared/api";

const api: Api = {
  invoke: (channel: Channel, payload?: unknown) => ipcRenderer.invoke(channel, payload)
};

contextBridge.exposeInMainWorld("api", api);
