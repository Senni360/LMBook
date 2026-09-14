const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "sennibookDesktop",
  Object.freeze({
    getInfo: () => ipcRenderer.invoke("desktop:info"),
    openDataFolder: () => ipcRenderer.invoke("desktop:open-data"),
    copyText: (text) => ipcRenderer.invoke("desktop:copy-text", text),
  }),
);
