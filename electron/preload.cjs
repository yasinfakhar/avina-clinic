/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
contextBridge.exposeInMainWorld("audiologyDesktop", Object.freeze({
  isDesktop: true,
  getInfo: () => invoke("desktop:info"),
  licenseStatus: () => invoke("license:status"),
  login: (username, password) => invoke("license:login", { username, password }),
  deactivate: () => invoke("license:deactivate"),
  chooseDataDirectory: () => invoke("storage:choose-directory"),
  moveDataDirectory: (destination) => invoke("storage:move-directory", { destination }),
  openDataDirectory: () => invoke("storage:open-directory"),
  createBackup: (reason = "manual") => invoke("storage:backup", { reason }),
  chooseHeader: () => invoke("settings:choose-header"),
  removeHeader: () => invoke("settings:remove-header"),
  checkForUpdates: () => invoke("updates:check"),
  installUpdate: () => invoke("updates:install"),
  onUpdateStatus: (listener) => {
    const wrapped = (_event, value) => listener(value);
    ipcRenderer.on("updates:status", wrapped);
    return () => ipcRenderer.removeListener("updates:status", wrapped);
  },
}));
