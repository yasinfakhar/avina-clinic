const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  appVersion: () => ipcRenderer.invoke("app:version"),
  licenseStatus: () => ipcRenderer.invoke("license:status"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.send("update:install"),
  generateReport: (recordId) => ipcRenderer.invoke("report:generate", recordId),
  generateAndOpenReport: (recordId) => ipcRenderer.invoke("report:generate-open", recordId),
  importLegacyData: () => ipcRenderer.invoke("data:import"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
});

contextBridge.exposeInMainWorld("activation", {
  fingerprint: () => ipcRenderer.invoke("license:fingerprint"),
  activate: (licenseKey) => ipcRenderer.invoke("license:activate", licenseKey),
});
