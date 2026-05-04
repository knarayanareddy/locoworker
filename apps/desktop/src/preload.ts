import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cowork", {
  getProjectRoot: () => ipcRenderer.invoke("get-project-root"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  openPath: (p: string) => ipcRenderer.invoke("open-path", p),
  platform: process.platform,
});
