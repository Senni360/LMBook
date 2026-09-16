const { contextBridge, ipcRenderer } = require("electron");
function readableDownloadError(error) {
  const message = String(error?.message || "Download failed.")
    .replace(/^Error invoking remote method '[^']+': Error:\s*/u, "")
    .replace(/^Error:\s*/u, "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim();
  return new Error(message.slice(0, 600) || "Download failed.");
}
contextBridge.exposeInMainWorld(
  "sennibookDesktop",
  Object.freeze({
    getInfo: () => ipcRenderer.invoke("desktop:info"),
    windowState: () => ipcRenderer.invoke("desktop:window-state"),
    windowAction: (action) =>
      ipcRenderer.invoke("desktop:window-action", action),
    quitResponse: (id, choice) =>
      ipcRenderer.invoke("desktop:quit-response", id, choice),
    onWindowState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("desktop:window-state", listener);
      return () => ipcRenderer.removeListener("desktop:window-state", listener);
    },
    onQuitRequest: (callback) => {
      const listener = (_event, id) => callback(id);
      ipcRenderer.on("desktop:quit-request", listener);
      return () => ipcRenderer.removeListener("desktop:quit-request", listener);
    },
    openDataFolder: () => ipcRenderer.invoke("desktop:open-data"),
    chooseVault: (reconnectId) =>
      ipcRenderer.invoke("desktop:choose-vault", reconnectId).catch((error) => {
        throw readableDownloadError(error);
      }),
    openVaultInObsidian: (vaultId, notePath) =>
      ipcRenderer
        .invoke("desktop:open-vault-obsidian", vaultId, notePath)
        .catch((error) => {
          throw readableDownloadError(error);
        }),
    revealVaultNote: (vaultId, notePath) =>
      ipcRenderer
        .invoke("desktop:reveal-vault-note", vaultId, notePath)
        .catch((error) => {
          throw readableDownloadError(error);
        }),
    copyText: (text) => ipcRenderer.invoke("desktop:copy-text", text),
    download: (id, path, suggestedName) =>
      ipcRenderer
        .invoke("desktop:download", { id, path, suggestedName })
        .catch((error) => {
          throw readableDownloadError(error);
        }),
    cancelDownload: (id) =>
      ipcRenderer.invoke("desktop:download-cancel", id).catch((error) => {
        throw readableDownloadError(error);
      }),
    onDownloadProgress: (callback) => {
      if (typeof callback !== "function")
        throw new TypeError("Download progress callback is required.");
      const listener = (_event, info) => callback(info);
      ipcRenderer.on("desktop:download-progress", listener);
      return () =>
        ipcRenderer.removeListener("desktop:download-progress", listener);
    },
  }),
);
